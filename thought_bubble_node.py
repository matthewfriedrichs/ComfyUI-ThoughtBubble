import json
import os
import random
from .parser import CanvasParser 
import comfy.sd
import comfy.utils
import folder_paths

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
    CATEGORY = "Widget Examples"

    def _load_wildcards(self):
        """Scans the wildcards directory and loads all .txt files into the cache."""
        if self.WILDCARD_CACHE:
            return
        try:
            comfyui_root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
            wildcards_dir = os.path.join(comfyui_root_dir, 'user', 'wildcards')
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
        This function now pre-loads wildcards and uses the seed for random choices.
        The 'seed' parameter is automatically passed by ComfyUI from the widget we defined.
        """
        self._load_wildcards()
        box_map = {}
        raw_prompt_source = ""
        positive_prompt, negative_prompt = "", ""
        positive_conditioning, negative_conditioning = None, None
        model_out, clip_out = model, clip

        try:
            data = json.loads(canvas_data)
            boxes = data.get("boxes", [])
            output_box_content, maximized_box = None, None
            for box in boxes:
                title = box.get("title", "").strip().lower()
                content = box.get("content", "")
                if title: box_map[title] = content
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
                loras_to_load = parser.loras_to_load

                if model is not None and clip is not None and loras_to_load:
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
            
            if clip_out is not None:
                tokens = clip_out.tokenize(positive_prompt)
                cond, pooled = clip_out.encode_from_tokens(tokens, return_pooled=True)
                positive_conditioning = [[cond.clone(), {"pooled_output": pooled.clone()}]]
                tokens = clip_out.tokenize(negative_prompt)
                cond, pooled = clip_out.encode_from_tokens(tokens, return_pooled=True)
                negative_conditioning = [[cond.clone(), {"pooled_output": pooled.clone()}]]
        except Exception as e:
            print(f"Thought Bubble Error: {e}")

        print(f"Thought Bubble: Parsed Positive Prompt: '{positive_prompt}'")
        print(f"Thought Bubble: Parsed Negative Prompt: '{negative_prompt}'")
        
        return (model_out, clip_out, positive_conditioning, negative_conditioning, positive_prompt, negative_prompt)