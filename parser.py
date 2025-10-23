# filename: thoughtbubble/parser.py

import re
import os
import random
from collections import namedtuple
import itertools
import unicodedata

# This single, clean import works because of the __init__.py in the commands folder
from . import commands

class CanvasParser:
    def __init__(self, box_map, wildcard_data, textfiles_directory, rng, iterator=0, control_vars_by_id=None, control_vars_by_name=None, command_links=None, textfile_cache=None, period_is_break=True):
        self.box_map = {k.lower(): v for k, v in box_map.items()}
        self.wildcards = wildcard_data
        self.textfiles_directory = textfiles_directory # Store the directory path
        self.rng = rng
        self.iterator = iterator
        self.variables = {}
        self.control_vars_by_id = control_vars_by_id if control_vars_by_id is not None else {}
        self.control_vars_by_name = control_vars_by_name if control_vars_by_name is not None else {}
        self.command_links = command_links if command_links is not None else {}
        self.textfile_cache = textfile_cache if textfile_cache is not None else {}
        self.embedding_cache = {} 
        self.period_is_break = period_is_break

        self.COMMAND_PRIORITY = [
            'HIDDEN_COMMAND', 'O_COMMAND',  
            'I_COMMAND', 'WILDCARD_COMMAND', 
            'RANDOM_COMMAND', 'NEG_COMMAND', 
            'V_COMMAND', # The one 'v' command
            'LORA_COMMAND', 'EMBED_COMMAND', 
            'AREA_COMMAND',
            'IF_COMMAND', 'MULTI_IF_COMMAND', 
        ]

        # The handler dictionary is now built from the imported commands package.
        self.command_handlers = {
            'AREA_COMMAND': commands.command_area.execute,
            'HIDDEN_COMMAND': commands.command_h.execute,
            'I_COMMAND': commands.command_i.execute,
            'IF_COMMAND': commands.command_if.execute,
            'LORA_COMMAND': commands.command_lora.execute,
            'EMBED_COMMAND': commands.command_embed.execute, 
            'MULTI_IF_COMMAND': commands.command_multi_if.execute,
            'NEG_COMMAND': commands.command_neg.execute,
            'O_COMMAND': commands.command_o.execute, 
            'RANDOM_COMMAND': commands.command_r.execute,
            'V_COMMAND': commands.command_v.execute, # Points to the new master v command
            'WILDCARD_COMMAND': commands.command_w.execute,
            # V_SET and V_GET are removed
        }
    
    def _parse_command(self, kind, value, **kwargs):
        handler = self.command_handlers.get(kind)
        if handler:
            return handler(self, value, **kwargs)
        return ""

    # --- Utility and Finalization Methods ---

    def _find_matching_paren(self, text, start_index):
        depth = 1
        for i in range(start_index + 1, len(text)):
            if text[i] == '(': depth += 1
            elif text[i] == ')': depth -= 1
            if depth == 0: return i
        return -1

    def _split_toplevel_options(self, text, delimiter='|'):
        parts, balance, last_split = [], 0, 0
        for i, char in enumerate(text):
            if char == '(': balance += 1
            elif char == ')': balance -= 1
            elif char == delimiter and balance == 0:
                parts.append(text[last_split:i])
                last_split = i + 1
        parts.append(text[last_split:])
        return parts

    def _get_list_from_content(self, content):
        options = self._split_toplevel_options(content)
        wildcard_name = options[0].strip().lower()
        if len(options) == 1 and wildcard_name in self.wildcards:
            return self.wildcards[wildcard_name]
        return options

    def _expand_template_dimension(self, template_string):
        parts, sub_lists, cursor = [], [], 0
        command_regex = re.compile(r'\b[iw]\s*\(|\(')
        while cursor < len(template_string):
            match = command_regex.search(template_string, cursor)
            if not match: parts.append(template_string[cursor:]); break
            paren_start = template_string.find('(', match.start())
            paren_end = self._find_matching_paren(template_string, paren_start)
            if paren_end == -1: parts.append(template_string[cursor:]); break
            parts.append(template_string[cursor:match.start()])
            sub_lists.append(self._get_list_from_content(template_string[paren_start + 1:paren_end]))
            parts.append(None)
            cursor = paren_end + 1
        if not sub_lists: return [template_string]
        final_list = []
        for combo in itertools.product(*sub_lists):
            result_str = "".join(list(combo).pop(0) if p is None else p for p in parts)
            final_list.append(self._recursive_resolve(result_str))
        return final_list

    def _recursive_resolve(self, text):
        while True:
            searches = {
                'I_COMMAND': list(re.finditer(r'\b[iI](\d*)\s*\(', text)),
                'O_COMMAND': list(re.finditer(r'\b[oO](\d*)\s*\(', text)), 
                'NEG_COMMAND': list(re.finditer(r'-(\d*)\s*\(', text)),
                'IF_COMMAND': list(re.finditer(r'\?(\d*)\s*\(', text)),
                'MULTI_IF_COMMAND': list(re.finditer(r'\?\?(\d*)\s*\(', text)),
                'HIDDEN_COMMAND': list(re.finditer(r'\b[hH](\d*)\s*\(', text)),
                'LORA_COMMAND': list(re.finditer(r'\b(lora|lra)(\d*)\s*\(', text, re.IGNORECASE)),
                'EMBED_COMMAND': list(re.finditer(r'\bembed(\d*)\s*\(', text, re.IGNORECASE)),
                'WILDCARD_COMMAND': list(re.finditer(r'\b[wW](\d*)\s*\(', text)),
                'RANDOM_COMMAND': list(re.finditer(r'\b[rR](\d*)\s*\(', text)),
                'AREA_COMMAND': list(re.finditer(r'\b[aA](\d*)\s*\(', text)),
                'V_COMMAND': list(re.finditer(r'\b[vV](\d*)\s*\(' , text)), # The one v() command
                # V_SET and V_GET are removed
            }
            innermost_command, max_depth = None, -1
            all_matches = [m for k in self.COMMAND_PRIORITY for m in searches.get(k, [])]
            for match in all_matches:
                depth = text[:match.start()].count('(') - text[:match.start()].count(')')
                if depth > max_depth: max_depth, innermost_command = depth, match
            
            if innermost_command is None: break

            kind = next(k for k, v in searches.items() if innermost_command in v)
            
            command_id = innermost_command.groups()[-1]

            paren_start = text.find('(', innermost_command.start())
            
            content_end, full_command_end = -1, -1

            if command_id:
                terminator = f"){command_id}"
                safe_end_pos = text.rfind(terminator, paren_start + 1)
                if safe_end_pos != -1:
                    content_end, full_command_end = safe_end_pos, safe_end_pos + len(terminator)
            
            if content_end == -1:
                content_end = self._find_matching_paren(text, paren_start)
                if content_end != -1:
                    full_command_end = content_end + 1

            if full_command_end == -1: break 
            
            # This is the key: The content *inside* the parens is resolved FIRST.
            # So v(myvar|v(box)) becomes v(myvar|box_content)
            # THEN the parser processes the outer v()
            content = self._recursive_resolve(text[paren_start + 1:content_end])
            
            kwargs = {'start_index': innermost_command.start()}
            if kind in ['IF_COMMAND', 'MULTI_IF_COMMAND']: 
                kwargs['context'] = text[:innermost_command.start()]
            
            result = self._parse_command(kind, content, **kwargs)
            text = text[:innermost_command.start()] + result + text[full_command_end:]

        return text

    def parse(self, text):
        self.variables, self.loras_to_load, self.areas_to_apply = {}, [], []
        
        resolved_text = self._recursive_resolve(text)
        
        # --- NEW: NEGATION TOGGLE LOGIC: !word ---
        positive_toggled_content = []

        def extract_and_remove_neg_toggles(match):
            # Case 1: Negative-to-Positive Toggle (e.g., -(ugly, !beautiful_eyes))
            neg_content = match.group(1)
            
            # Find all !words inside this negative content block
            def process_toggle(toggle_match):
                toggled_word = toggle_match.group(1)
                # CRITICAL FIX: Replace underscore with space ONLY for the toggled word
                positive_toggled_content.append(toggled_word.replace('_', ' ')) 
                return "" # Remove the !word from the negative content block
            
            # The negative content is modified: !word is replaced by an empty string
            new_neg_content = re.sub(r'!\s*([a-zA-Z0-9_]+)', process_toggle, neg_content)
            
            # Reconstruct the ###NEG### block with the modified content
            return f"###NEG###{new_neg_content}###/NEG###"
            
        # Apply the negative-to-positive toggle logic. This modifies the existing ###NEG### blocks and populates positive_toggled_content
        toggled_text = re.sub(r'###NEG###(.*?)###/NEG###', extract_and_remove_neg_toggles, resolved_text, flags=re.DOTALL)
        
        # 2. Positive-to-Negative Toggle: Wrap !word in positive text into ###NEG### tags.
        def handle_pos_to_neg_toggle(match):
            toggled_word = match.group(1)
            # CRITICAL FIX: Replace underscore with space ONLY for the toggled word
            processed_word = toggled_word.replace('_', ' ')
            # Wrap in the full NEG tag, which will be extracted later
            return f"###NEG###{processed_word}###/NEG###"
            
        # Apply to all remaining '!' in the text
        toggled_text = re.sub(r'!\s*([a-zA-Z0-9_]+)', handle_pos_to_neg_toggle, toggled_text)
        
        # 3. Separate Prompts
        
        # Extract all final negative content (Underscores in untoggled negative text remain)
        negative_prompt_raw_parts = re.findall(r'###NEG###(.*?)###/NEG###', toggled_text, re.DOTALL)
        negative_prompt = " ".join(part.strip() for part in negative_prompt_raw_parts if part.strip())
        
        # Base positive text is what remains after stripping all ###NEG### tags (Underscores in untoggled positive text remain)
        base_positive_text = re.sub(r'###NEG###.*?###/NEG###', '', toggled_text, flags=re.DOTALL).strip()
        
        # Reconstruct the full positive prompt (base text + negative-to-positive toggles)
        # Note: Toggled text already has its underscores replaced. Base text does not.
        full_positive_text = base_positive_text + " " + " ".join(positive_toggled_content)
        
        # 4. Final cleaning and formatting
        
        # Underscore replacement for *untoggled* text is now correctly omitted.

        # --- PERIOD BREAK TAGGING (CORRECTED) ---
        def protect_decimal(match):
            # Match is expected to be something like '1.0'
            return match.group(0).replace('.', '###DECIMAL_PROTECT###', 1)

        break_tagged_positive_prompt = full_positive_text
        if self.period_is_break:
            # Protect all floating point numbers (e.g., 1.0)
            break_tagged_positive_prompt = re.sub(r'\d\.\d', protect_decimal, full_positive_text)
            
            # Replace all remaining periods (sentence/phrase separators) with the BREAK tag.
            break_tagged_positive_prompt = break_tagged_positive_prompt.replace('.', ' ###PERIOD_BREAK_TAG### ')
            
            # Restore the decimal points
            break_tagged_positive_prompt = break_tagged_positive_prompt.replace('###DECIMAL_PROTECT###', '.')
        
        # Final cleaning and splitting by comma
        positive_prompt = ", ".join(filter(None, [p.strip() for p in re.sub(r'\s+', ' ', break_tagged_positive_prompt).strip().split(',')]))
        
        # Convert the unique tag to the ComfyUI BREAK keyword if enabled.
        if self.period_is_break:
            positive_prompt = positive_prompt.replace('###PERIOD_BREAK_TAG###', ' BREAK ')
            
        # The negative prompt is cleaned simply (no period break logic for negative)
        negative_prompt = ", ".join(filter(None, [p.strip() for p in re.sub(r'\s+', ' ', negative_prompt).strip().split(',')]))
        
        return positive_prompt, negative_prompt