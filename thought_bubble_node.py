import json
import os
import random
from .parser import CanvasParser 
import comfy.sd
import comfy.utils
import folder_paths
import torch

class ThoughtBubbleNode:
    """
    A node that hosts an interactive canvas widget for creating and managing text boxes.
    It now includes a seed widget to control randomness for wildcards.
    """
    WILDCARD_CACHE = {}
    
    @classmethod
    def INPUT_TYPES(s):
        """
        Defines the input types for the node, now with a seed widget.
        """
        default_state = {
            "boxes": [{
                "id": "default-output-box",
                "title": "output",
                "content": "",
                "x": 100, "y": 100, "width": 400, "height": 300,
                "displayState": "normal"
            }],
            "pan": {"x": 0, "y": 0},
            "zoom": 1.0,
            "gridSize": 100,
            "showGrid": True,
            "savedView": None
        }
        
        return {
            "required": {
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff}),
                "canvas_data": ("STRING", {
                    "multiline": True,
                    "default": json.dumps(default_state),
                }),
            },
            "optional": {
                "model": ("MODEL",),
                "clip": ("CLIP",),
            }
        }

    RETURN_TYPES = ("MODEL", "CLIP", "CONDITIONING", "CONDITIONING", "STRING", "STRING")
    RETURN_NAMES = ("model", "clip", "positive", "negative", "positive_prompt_text", "negative_prompt_text")
    FUNCTION = "process_data"
    CATEGORY = "Workflow Efficiency"

    def _load_wildcards(self):
        """Scans the wildcards directory and loads all .txt files into the cache."""
        if self.WILDCARD_CACHE:
            return
        try:
            wildcards_dir = os.path.join(os.path.dirname(folder_paths.get_input_directory()), 'user', 'wildcards')
            if not os.path.exists(wildcards_dir):
                os.makedirs(wildcards_dir, exist_ok=True)
            
            print("Thought Bubble: Loading wildcards...")
            for filename in os.listdir(wildcards_dir):
                if filename.endswith(".txt"):
                    name_without_ext = os.path.splitext(filename)[0].lower()
                    filepath = os.path.join(wildcards_dir, filename)
                    with open(filepath, 'r', encoding='utf-8') as f:
                        lines = [line.strip() for line in f if line.strip()]
                        self.WILDCARD_CACHE[name_without_ext] = lines
            print(f"Thought Bubble: Loaded {len(self.WILDCARD_CACHE)} wildcard files.")
        except Exception as e:
            print(f"Thought Bubble Error loading wildcards: {e}")

    def process_data(self, canvas_data, seed, model=None, clip=None):
        """
        Processes the canvas data to produce text prompts and conditioning,
        now including support for area conditioning boxes.
        """
        self._load_wildcards()
        box_map = {}
        area_boxes = {}
        raw_prompt_source = ""
        positive_prompt, negative_prompt = "", ""
        model_out, clip_out = model, clip

        try:
            data = json.loads(canvas_data)
            boxes = data.get("boxes", [])
            output_box_content, maximized_box = None, None
            
            for box in boxes:
                title = box.get("title", "").strip().lower()
                content = box.get("content", "")
                box_type = box.get("type", "text")

                if title: 
                    box_map[title] = content
                    if box_type == "area":
                        area_boxes[title] = box

                if title == "output": output_box_content = content
                if box.get("displayState") == "maximized" and maximized_box is None:
                    maximized_box = box
            
            maximized_title = maximized_box.get("title", "").strip().lower() if maximized_box else ""
            if maximized_box and maximized_title != "output":
                raw_prompt_source = maximized_box.get("content", "")
            elif output_box_content is not None:
                raw_prompt_source = output_box_content
            
            if raw_prompt_source:
                rng = random.Random()
                rng.seed(seed)
                parser = CanvasParser(box_map, self.WILDCARD_CACHE, rng)
                positive_prompt, negative_prompt = parser.parse(raw_prompt_source)
                
                if model is not None and clip is not None and parser.loras_to_load:
                    model_out, clip_out = self.apply_loras(model, clip, parser.loras_to_load)

            if clip_out is not None:
                positive_conditioning = self.text_to_conditioning(clip_out, positive_prompt)
                negative_conditioning = self.text_to_conditioning(clip_out, negative_prompt)

                if parser.areas_to_apply:
                    positive_conditioning = self.apply_area_conditioning(
                        clip_out, positive_conditioning, parser.areas_to_apply, area_boxes, parser
                    )
            else:
                # FIX: Return empty conditioning if no CLIP is provided, preventing the crash.
                positive_conditioning = []
                negative_conditioning = []

        except Exception as e:
            print(f"Thought Bubble Error: {e}")
        
        return (model_out, clip_out, positive_conditioning, negative_conditioning, positive_prompt, negative_prompt)

    def text_to_conditioning(self, clip, text):
        """Helper to convert text to a conditioning tensor."""
        if not text: # Return empty conditioning for empty string
            return []
        tokens = clip.tokenize(text)
        cond, pooled = clip.encode_from_tokens(tokens, return_pooled=True)
        return [[cond.clone(), {"pooled_output": pooled.clone()}]]

    def apply_loras(self, model, clip, loras_to_load):
        """Helper to apply a list of LoRAs to the model and clip."""
        model_out = model.clone()
        clip_out = clip.clone()
        available_loras = folder_paths.get_filename_list("loras")
        for lora_name, model_strength, clip_strength in loras_to_load:
            lora_filename = next((l for l in available_loras if l.startswith(lora_name)), None)
            if lora_filename:
                try:
                    lora_path = folder_paths.get_full_path("loras", lora_filename)
                    lora = comfy.utils.load_torch_file(lora_path, safe_load=True)
                    model_out, clip_out = comfy.sd.load_lora_for_models(
                        model_out, clip_out, lora, model_strength, clip_strength
                    )
                    print(f"  - Applied LoRA: {lora_filename} (model: {model_strength}, clip: {clip_strength})")
                except Exception as e:
                    print(f"Thought Bubble Warning: Could not apply LoRA '{lora_filename}': {e}")
            else:
                print(f"Thought Bubble Warning: Could not find a file for LoRA '{lora_name}'")
        return model_out, clip_out

    def apply_area_conditioning(self, clip, base_conditioning, area_titles, area_boxes_data, parser):
        """
        Applies area conditioning in the order specified by the `area_titles` list,
        which is determined by the `a()` commands in the output box.
        """
        final_conditioning = base_conditioning.copy()
        # The loop iterates through the area titles in the exact order they appeared in the prompt.
        for title in area_titles:
            if title in area_boxes_data:
                area_box = area_boxes_data[title]
                
                # Resolve any syntax (like wildcards) inside the area box prompt
                area_prompt, _ = parser.parse(area_box.get("content", ""))
                if not area_prompt:
                    continue

                image_width = area_box.get("imageWidth", 512)
                image_height = area_box.get("imageHeight", 512)
                
                latent_width = image_width // 8
                latent_height = image_height // 8
                x = area_box.get("areaX", 0) // 8
                y = area_box.get("areaY", 0) // 8
                width = area_box.get("areaWidth", 64) // 8
                height = area_box.get("areaHeight", 64) // 8
                strength = area_box.get("strength", 1.0)
                
                if width <= 0 or height <= 0: continue

                mask = torch.zeros((latent_height, latent_width), dtype=torch.float32, device="cpu")
                mask[y:y + height, x:x + width] = 1.0

                area_cond_data = self.text_to_conditioning(clip, area_prompt)
                if not area_cond_data:
                    continue
                
                cond_tensor = area_cond_data[0][0]
                cond_dict = area_cond_data[0][1].copy()
                cond_dict['mask'] = mask
                cond_dict['mask_strength'] = strength

                final_conditioning.append([cond_tensor, cond_dict])

        return final_conditioning

