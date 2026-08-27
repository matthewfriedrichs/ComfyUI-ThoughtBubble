from __future__ import annotations

import json
import os
import random
from typing import Any, Dict, List, Optional

import folder_paths
import numpy as np
import torch
from server import PromptServer

from .parser import CanvasParser


class ThoughtBubbleNode:
    WILDCARD_CACHE: Dict[str, List[str]] = {}
    TEXTFILE_DIRECTORY: Optional[str] = None
    TEXTFILE_CACHE: Dict[str, str] = {}

    def __init__(self):
        self.run_count = 0
        self.cached_model = None
        self.cached_clip = None
        self.last_lora_config = None
        self.last_input_model_id = None
        self.last_input_clip_id = None
        self.cached_positive_cond = None
        self.cached_negative_cond = None
        self.last_positive_prompt = None
        self.last_negative_prompt = None
        self.last_clip_id = None

    @classmethod
    def INPUT_TYPES(s):
        default_state = {
            "boxes": [
                {
                    "id": "default-output-box",
                    "title": "output",
                    "content": "",
                    "x": 100,
                    "y": 100,
                    "width": 400,
                    "height": 300,
                    "displayState": "normal",
                    "type": "text",
                }
            ],
            "pan": {"x": 0, "y": 0},
            "zoom": 1.0,
            "gridSize": 100,
            "showGrid": True,
            "savedView": None,
            "theme": {},
        }
        return {
            "required": {
                "canvas_data": (
                    "STRING",
                    {"multiline": False, "default": json.dumps(default_state)},
                ),
            },
            "optional": {
                "model": ("MODEL",),
                "clip": ("CLIP",),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("MODEL", "CLIP", "CONDITIONING", "CONDITIONING", "STRING", "STRING")
    RETURN_NAMES = (
        "model",
        "clip",
        "positive",
        "negative",
        "positive_prompt_text",
        "negative_prompt_text",
    )
    FUNCTION = "process_data"
    CATEGORY = "Workflow Efficiency"

    @classmethod
    def IS_CHANGED(s, canvas_data, **kwargs):
        # Force ComfyUI to re-execute every time so persister values mutate continuously
        return float("NaN")

    def _get_user_directory(self) -> str:
        getter = getattr(folder_paths, "get_user_directory", None)
        if getter is not None:
            return getter()
        return os.path.join(os.path.dirname(folder_paths.get_input_directory()), "user")

    def _load_wildcards(self) -> None:
        if self.WILDCARD_CACHE:
            return
        try:
            wildcards_dir = os.path.join(self._get_user_directory(), "wildcards")
            if not os.path.exists(wildcards_dir):
                os.makedirs(wildcards_dir, exist_ok=True)
            for filename in os.listdir(wildcards_dir):
                if filename.endswith(".txt"):
                    name = os.path.splitext(filename)[0].lower()
                    with open(os.path.join(wildcards_dir, filename), "r", encoding="utf-8") as f:
                        self.WILDCARD_CACHE[name] = [line.strip() for line in f]
        except Exception as e:
            print(f"[Thought Bubble Error] Loading wildcards: {e}")

    def process_data(self, canvas_data: str, model=None, clip=None, unique_id=None, **kwargs):
        self._load_wildcards()
        if self.TEXTFILE_DIRECTORY is None:
            self.TEXTFILE_DIRECTORY = os.path.join(self._get_user_directory(), "textfiles")
            if not os.path.exists(self.TEXTFILE_DIRECTORY):
                os.makedirs(self.TEXTFILE_DIRECTORY, exist_ok=True)

        box_map: Dict[str, str] = {}
        raw_prompt_source = ""
        target_box_ref = None
        positive_prompt, negative_prompt = "", ""
        positive_conditioning, negative_conditioning = [], []
        model_out, clip_out = model, clip

        seed = random.randint(0, 0xFFFFFFFFFFFFFFFF)

        try:
            data = json.loads(canvas_data)
            boxes = data.get("boxes", [])
            output_box = None
            maximized_box = None
            first_text_box = None

            for box in boxes:
                title = box.get("title", "").strip().lower()
                content = box.get("content", "")
                if title:
                    box_map[title] = content
                if first_text_box is None and content.strip():
                    first_text_box = box
                if title == "output":
                    output_box = box
                if box.get("displayState") == "maximized" and maximized_box is None:
                    maximized_box = box

            # Target active box
            if maximized_box:
                target_box_ref = maximized_box
            elif output_box is not None:
                target_box_ref = output_box
            elif first_text_box is not None:
                target_box_ref = first_text_box
            elif boxes:
                target_box_ref = boxes[0]

            if target_box_ref:
                raw_prompt_source = target_box_ref.get("content", "")

            if raw_prompt_source:
                rng = random.Random()
                rng.seed(seed)

                parser = CanvasParser(
                    box_map=box_map,
                    wildcard_data=self.WILDCARD_CACHE,
                    textfiles_directory=self.TEXTFILE_DIRECTORY,
                    rng=rng,
                    iterator=self.run_count,
                    seed=seed,
                    textfile_cache=self.TEXTFILE_CACHE,
                )

                positive_prompt, negative_prompt, mutated_prompt = parser.parse(
                    raw_prompt_source, return_mutated=True
                )
                self.run_count += 1

                # If persisters mutated, broadcast atomic diffs to keep live editing intact
                if mutated_prompt != raw_prompt_source:
                    target_box_ref["content"] = mutated_prompt
                    box_title = target_box_ref.get("title", "").strip().lower()
                    if box_title:
                        box_map[box_title] = mutated_prompt

                    if unique_id is not None:
                        try:
                            PromptServer.instance.send_sync(
                                "thoughtbubble-persister-update",
                                {
                                    "node_id": str(unique_id),
                                    "box_id": target_box_ref.get("id"),
                                    "content": mutated_prompt,
                                    "persister_updates": parser.changed_persisters,
                                    "canvas_data": json.dumps(data),
                                },
                            )
                        except Exception as e:
                            print(f"[Thought Bubble Warning] Could not broadcast persister update: {e}")

                print(f'[Thought Bubble] Prompt parsed -> Positive: "{positive_prompt}"')
                if negative_prompt:
                    print(f'[Thought Bubble] Prompt parsed -> Negative: "{negative_prompt}"')

                # LoRA Application Pipeline
                loras_to_load = parser.loras_to_load
                if loras_to_load:
                    if model is not None or clip is not None:
                        current_lora_config = tuple(sorted(loras_to_load))
                        if (
                            self.cached_model is not None
                            and (model is None or self.last_input_model_id == id(model))
                            and (clip is None or self.last_input_clip_id == id(clip))
                            and self.last_lora_config == current_lora_config
                        ):
                            model_out, clip_out = self.cached_model, self.cached_clip
                        else:
                            model_out, clip_out = parser.apply_loras(model, clip)
                            self.cached_model, self.cached_clip = model_out, clip_out
                            self.last_lora_config = current_lora_config
                            self.last_input_model_id = id(model) if model is not None else None
                            self.last_input_clip_id = id(clip) if clip is not None else None
                else:
                    if model is not None or clip is not None:
                        self.last_lora_config, self.cached_model, self.cached_clip = None, None, None
                        model_out, clip_out = model, clip

            # Conditioning Generation Pipeline
            if clip_out is not None:
                if (
                    self.cached_positive_cond is not None
                    and self.last_clip_id == id(clip_out)
                    and self.last_positive_prompt == positive_prompt
                    and self.last_negative_prompt == negative_prompt
                ):
                    positive_conditioning = self.cached_positive_cond
                    negative_conditioning = self.cached_negative_cond
                else:
                    positive_conditioning = self.text_to_conditioning(clip_out, positive_prompt)
                    negative_conditioning = self.text_to_conditioning(clip_out, negative_prompt)
                    self.cached_positive_cond = positive_conditioning
                    self.cached_negative_cond = negative_conditioning
                    self.last_positive_prompt = positive_prompt
                    self.last_negative_prompt = negative_prompt
                    self.last_clip_id = id(clip_out)

        except json.JSONDecodeError:
            print("[Thought Bubble Error] Could not decode JSON data from canvas.")
        except Exception as e:
            print(f"[Thought Bubble Error] {e}")

        return (
            model_out,
            clip_out,
            positive_conditioning,
            negative_conditioning,
            positive_prompt,
            negative_prompt,
        )

    def text_to_conditioning(self, clip, text: str):
        tokens = clip.tokenize(text or "")
        return clip.encode_from_tokens_scheduled(tokens)