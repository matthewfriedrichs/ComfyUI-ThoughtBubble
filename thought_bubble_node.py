# thought_bubble_node.py

import json
import os
import random
from .parser import CanvasParser 
import comfy.sd
import comfy.utils
import folder_paths
from server import PromptServer 
import torch

class ThoughtBubbleNode:
    WILDCARD_CACHE = {}
    LORA_CACHE = {} 
    TEXTFILE_DIRECTORY = None 
    TEXTFILE_CACHE = {} # <-- NEW: Add a cache for text files

    def __init__(self):
        # Instance-level cache for models and conditioning
        self.cached_model = None
        self.cached_clip = None
        self.last_lora_config = None
        self.last_input_model_id = None
        
        self.cached_positive_cond = None
        self.cached_negative_cond = None
        self.last_positive_prompt = None
        self.last_negative_prompt = None
        self.last_clip_id = None
        
        # --- NEW: Caching for area conditioning ---
        self.last_area_config = None

    @classmethod
    def INPUT_TYPES(s):
        default_state = {
            "boxes": [{"id": "default-output-box", "title": "output", "content": "", "x": 100, "y": 100, "width": 400, "height": 300, "displayState": "normal", "type": "text"}],
            "pan": {"x": 0, "y": 0}, "zoom": 1.0, "gridSize": 100, "showGrid": True, "savedView": None,
            "iterator": 0,
            "theme": {}
        }
        
        return {
            "required": {
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff}),
                "canvas_data": ("STRING", {"multiline": True, "default": json.dumps(default_state)}),
            },
            "optional": {
                "model": ("MODEL",),
                "clip": ("CLIP",),
            },
        }

    RETURN_TYPES = ("MODEL", "CLIP", "CONDITIONING", "CONDITIONING", "STRING", "STRING")
    RETURN_NAMES = ("model", "clip", "positive", "negative", "positive_prompt_text", "negative_prompt_text")
    FUNCTION = "process_data"
    CATEGORY = "Workflow Efficiency"

    def _load_wildcards(self):
        if self.WILDCARD_CACHE: return
        try:
            wildcards_dir = os.path.join(os.path.dirname(folder_paths.get_input_directory()), 'user', 'wildcards')
            if not os.path.exists(wildcards_dir): os.makedirs(wildcards_dir, exist_ok=True)
            for filename in os.listdir(wildcards_dir):
                if filename.endswith(".txt"):
                    name = os.path.splitext(filename)[0].lower()
                    with open(os.path.join(wildcards_dir, filename), 'r', encoding='utf-8') as f:
                        # --- FIX: Removed 'if line.strip()' to allow empty lines ---
                        self.WILDCARD_CACHE[name] = [line.strip() for line in f]
        except Exception as e:
            print(f"Thought Bubble Error loading wildcards: {e}")

    def process_data(self, seed, canvas_data, model=None, clip=None):
        self._load_wildcards()
        
        if self.TEXTFILE_DIRECTORY is None:
            self.TEXTFILE_DIRECTORY = os.path.join(os.path.dirname(folder_paths.get_input_directory()), 'user', 'textfiles')
            if not os.path.exists(self.TEXTFILE_DIRECTORY):
                os.makedirs(self.TEXTFILE_DIRECTORY, exist_ok=True)

        box_map, area_boxes = {}, {}
        raw_prompt_source, command_links = "", {}
        positive_prompt, negative_prompt = "", ""
        positive_conditioning, negative_conditioning = [], []
        model_out, clip_out = model, clip
        
        all_control_vars_by_id = {}
        all_control_vars_by_name = {}

        try:
            data = json.loads(canvas_data)
            iterator = data.get("iterator", 0)
            period_is_break = data.get("periodIsBreak", True) # <--- NEW: Get state
            boxes = data.get("boxes", [])
            output_box_content, maximized_box = None, None
            
            for box in boxes:
                if box.get("type") == "controls":
                    for var in box.get("variables", []):
                        var_id, var_name, var_value = var.get("id"), var.get("name"), var.get("value")
                        if var_id: all_control_vars_by_id[var_id] = var_value
                        if var_name: all_control_vars_by_name[var_name] = var_value

            for box in boxes:
                title = box.get("title", "").strip().lower()
                if title: 
                    box_map[title] = box.get("content", "")
                    if box.get("type") == "area": area_boxes[title] = box
                if title == "output": 
                    output_box_content = box.get("content", "")
                    command_links = box.get("commandLinks", {})
                if box.get("displayState") == "maximized" and maximized_box is None:
                    maximized_box = box
            
            if maximized_box:
                raw_prompt_source = maximized_box.get("content", "")
                command_links = maximized_box.get("commandLinks", {})
            elif output_box_content is not None:
                raw_prompt_source = output_box_content
            
            if raw_prompt_source:
                rng = random.Random()
                rng.seed(seed)
                parser = CanvasParser(
                    box_map, self.WILDCARD_CACHE, self.TEXTFILE_DIRECTORY, rng, iterator, 
                    all_control_vars_by_id, all_control_vars_by_name, command_links,
                    self.TEXTFILE_CACHE,
                    period_is_break=period_is_break # <--- NEW: Pass state
                )
                positive_prompt, negative_prompt = parser.parse(raw_prompt_source)
                
                if model is not None and clip is not None:
                    loras_to_load = parser.loras_to_load
                    if not loras_to_load:
                        self.last_lora_config, self.cached_model, self.cached_clip = None, None, None
                        model_out, clip_out = model, clip
                    else:
                        current_lora_config = tuple(sorted(loras_to_load))
                        if (self.cached_model is not None and self.last_input_model_id == id(model) and self.last_lora_config == current_lora_config):
                            model_out, clip_out = self.cached_model, self.cached_clip
                        else:
                            model_out, clip_out = self.apply_loras(model, clip, loras_to_load)
                            self.cached_model, self.cached_clip = model_out, clip_out
                            self.last_lora_config, self.last_input_model_id = current_lora_config, id(model)

            if clip_out is not None:
                current_area_config = None
                if hasattr(parser, 'areas_to_apply') and parser.areas_to_apply:
                    config_list = []
                    for title in sorted(parser.areas_to_apply):
                        if title in area_boxes:
                            area_box = area_boxes[title]
                            area_prompt, _ = parser.parse(area_box.get("content", ""))
                            if area_prompt:
                                config_list.append((
                                    area_prompt,
                                    area_box.get("imageWidth", 512), area_box.get("imageHeight", 512),
                                    area_box.get("areaX", 0), area_box.get("areaY", 0),
                                    area_box.get("areaWidth", 64), area_box.get("areaHeight", 64),
                                    area_box.get("strength", 1.0)
                                ))
                    current_area_config = tuple(config_list)

                if (self.cached_positive_cond is not None and
                    self.last_clip_id == id(clip_out) and
                    self.last_positive_prompt == positive_prompt and
                    self.last_negative_prompt == negative_prompt and
                    self.last_area_config == current_area_config):
                    
                    positive_conditioning = self.cached_positive_cond
                    negative_conditioning = self.cached_negative_cond
                else:
                    positive_conditioning = self.text_to_conditioning(clip_out, positive_prompt)
                    negative_conditioning = self.text_to_conditioning(clip_out, negative_prompt)
                    
                    if current_area_config:
                        for area_config in current_area_config:
                            (area_prompt, img_w, img_h, x, y, w, h, strength) = area_config
                            if w <= 0 or h <= 0: continue
                            
                            mask = torch.zeros((img_h // 8, img_w // 8), dtype=torch.float32, device="cpu")
                            mask[y//8:(y+h)//8, x//8:(x+w)//8] = 1.0
                            
                            area_cond_data = self.text_to_conditioning(clip_out, area_prompt)
                            if not area_cond_data: continue
                            
                            cond_tensor, cond_dict = area_cond_data[0][0], area_cond_data[0][1].copy()
                            cond_dict['mask'], cond_dict['mask_strength'] = mask, strength
                            positive_conditioning.append([cond_tensor, cond_dict])

                    self.cached_positive_cond = positive_conditioning
                    self.cached_negative_cond = negative_conditioning
                    self.last_positive_prompt = positive_prompt
                    self.last_negative_prompt = negative_prompt
                    self.last_clip_id = id(clip_out)
                    self.last_area_config = current_area_config

        except json.JSONDecodeError:
            print(f"Thought Bubble Error: Could not decode JSON data from canvas.")
        except Exception as e:
            print(f"Thought Bubble Error: {e}")
        
        return (model_out, clip_out, positive_conditioning, negative_conditioning, positive_prompt, negative_prompt)

    def text_to_conditioning(self, clip, text):
        if not text: return []
        tokens = clip.tokenize(text)
        cond, pooled = clip.encode_from_tokens(tokens, return_pooled=True)
        return [[cond.clone(), {"pooled_output": pooled.clone()}]]

    def apply_loras(self, model, clip, loras_to_load):
        model_out, clip_out = model.clone(), clip.clone()
        available_loras = folder_paths.get_filename_list("loras")

        for lora_name, model_strength, clip_strength in loras_to_load:
            lora_filename = next((l for l in available_loras if l.startswith(lora_name)), None)
            if lora_filename:
                try:
                    lora_path = folder_paths.get_full_path("loras", lora_filename)
                    
                    if lora_path in self.LORA_CACHE:
                        lora = self.LORA_CACHE[lora_path]
                    else:
                        lora = comfy.utils.load_torch_file(lora_path, safe_load=True)
                        self.LORA_CACHE[lora_path] = lora

                    model_out, clip_out = comfy.sd.load_lora_for_models(
                        model_out, clip_out, lora, model_strength, clip_strength)
                        
                except Exception as e:
                    print(f"Thought Bubble Warning: Could not apply LoRA '{lora_filename}': {e}")
            else:
                print(f"Thought Bubble Warning: Could not find a file for LoRA '{lora_name}'")
        
        return model_out, clip_out