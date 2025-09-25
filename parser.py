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
    def __init__(self, box_map, wildcard_data, textfiles_directory, rng, iterator=0, control_vars_by_id=None, control_vars_by_name=None, command_links=None):
        self.box_map = {k.lower(): v for k, v in box_map.items()}
        self.wildcards = wildcard_data
        self.textfiles_directory = textfiles_directory # Store the directory path
        self.rng = rng
        self.iterator = iterator
        self.variables = {}
        self.control_vars_by_id = control_vars_by_id if control_vars_by_id is not None else {}
        self.control_vars_by_name = control_vars_by_name if control_vars_by_name is not None else {}
        self.command_links = command_links if command_links is not None else {}
        self.replacements = []

        self.COMMAND_PRIORITY = [
            'HIDDEN_COMMAND', 'V_COMMAND', 'O_COMMAND', 'C_COMMAND', 'I_COMMAND', 'WILDCARD_COMMAND', 
            'RANDOM_COMMAND', 'NEG_COMMAND', 
            'LORA_COMMAND', 'AREA_COMMAND', 'FORCE_COMMAND',
            'IF_COMMAND', 'MULTI_IF_COMMAND', 
        ]

        # The handler dictionary is now built from the imported commands package.
        self.command_handlers = {
            'AREA_COMMAND': commands.command_area.execute,
            'C_COMMAND': commands.command_c.execute,
            'FORCE_COMMAND': commands.command_force.execute,
            'HIDDEN_COMMAND': commands.command_h.execute,
            'I_COMMAND': commands.command_i.execute,
            'IF_COMMAND': commands.command_if.execute,
            'LORA_COMMAND': commands.command_lora.execute,
            'MULTI_IF_COMMAND': commands.command_multi_if.execute,
            'NEG_COMMAND': commands.command_neg.execute,
            'O_COMMAND': commands.command_o.execute, # Add the new handler
            'RANDOM_COMMAND': commands.command_r.execute,
            'V_COMMAND': commands.command_v.execute,
            'WILDCARD_COMMAND': commands.command_w.execute,
        }
    
    def _parse_command(self, kind, value, **kwargs):
        handler = self.command_handlers.get(kind)
        if handler:
            return handler(self, value, **kwargs)
        return ""

    # --- Utility and Finalization Methods ---
    def _levenshtein_distance(self, s1, s2):
        if len(s1) < len(s2): return self._levenshtein_distance(s2, s1)
        if len(s2) == 0: return len(s1)
        previous_row = range(len(s2) + 1)
        for i, c1 in enumerate(s1):
            current_row = [i + 1]
            for j, c2 in enumerate(s2):
                insertions, deletions = previous_row[j + 1] + 1, current_row[j] + 1
                substitutions = previous_row[j] + (c1 != c2)
                current_row.append(min(insertions, deletions, substitutions))
            previous_row = current_row
        return previous_row[-1]

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
                'V_COMMAND': list(re.finditer(r'\b[vV](\d*)\s*\(', text)),
                'O_COMMAND': list(re.finditer(r'\b[oO](\d*)\s*\(', text)), # Add the new regex
                'C_COMMAND': list(re.finditer(r'\b[cC](\d*)\s*\(', text)),
                'NEG_COMMAND': list(re.finditer(r'-(\d*)\s*\(', text)),
                'IF_COMMAND': list(re.finditer(r'\?(\d*)\s*\(', text)),
                'MULTI_IF_COMMAND': list(re.finditer(r'\?\?(\d*)\s*\(', text)),
                'HIDDEN_COMMAND': list(re.finditer(r'\b[hH](\d*)\s*\(', text)),
                'FORCE_COMMAND': list(re.finditer(r'\b[fF](\d*)\s*\(', text)),
                'LORA_COMMAND': list(re.finditer(r'\b(lora|lra)(\d*)\s*\(', text, re.IGNORECASE)),
                'WILDCARD_COMMAND': list(re.finditer(r'\b[wW](\d*)\s*\(', text)),
                'RANDOM_COMMAND': list(re.finditer(r'\b[rR](\d*)\s*\(', text)),
                'AREA_COMMAND': list(re.finditer(r'\b[aA](\d*)\s*\(', text)),
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

            content = self._recursive_resolve(text[paren_start + 1:content_end])
            kwargs = {'start_index': innermost_command.start()}
            if kind in ['IF_COMMAND', 'MULTI_IF_COMMAND']: 
                kwargs['context'] = text[:innermost_command.start()]
            
            result = self._parse_command(kind, content, **kwargs)
            text = text[:innermost_command.start()] + result + text[full_command_end:]

        return text

    def parse(self, text):
        self.variables, self.loras_to_load, self.areas_to_apply, self.replacements = {}, [], [], []
        
        resolved_text = self._recursive_resolve(text)

        # The replacement loop now handles the new conditional format.
        for item in self.replacements:
            # Unpack the item, supporting both old and new formats.
            if len(item) == 3:
                fuzzy_words, replace_text, condition_words = item
            else: # Support for the old f(word|replacement) syntax
                fuzzy_words, replace_text = item
                condition_words = []

            # Check if all conditions are met in the current state of the prompt.
            if condition_words:
                all_conditions_met = all(
                    re.search(r'\b' + re.escape(cond.lower()) + r'\b', resolved_text.lower()) 
                    for cond in condition_words
                )
                if not all_conditions_met:
                    continue # Skip this replacement if conditions are not met.

            # If conditions are met (or there are none), proceed with the replacement.
            text_words, new_text_words, i = resolved_text.split(), [], 0
            while i < len(text_words):
                is_match = False
                if i + len(fuzzy_words) <= len(text_words):
                    is_match = True
                    for j in range(len(fuzzy_words)):
                        word_to_check = re.sub(r'[^a-zA-Z]', '', text_words[i+j])
                        find_word, threshold = fuzzy_words[j]
                        if not word_to_check and not find_word: continue
                        max_len = max(len(word_to_check), len(find_word))
                        distance = self._levenshtein_distance(word_to_check, find_word)
                        similarity = (1 - distance / max_len) * 100 if max_len > 0 else 100
                        if similarity < threshold: is_match = False; break
                if is_match:
                    new_text_words.append(replace_text)
                    i += len(fuzzy_words)
                else:
                    new_text_words.append(text_words[i])
                    i += 1
            resolved_text = " ".join(new_text_words)
            
        negative_parts = re.findall(r'###NEG###(.*?)###/NEG###', resolved_text, re.DOTALL)
        negative_prompt = ", ".join(p.strip() for p in negative_parts if p.strip())
        positive_prompt = re.sub(r'###NEG###.*?###/NEG###', '', resolved_text)
        
        # This new line strips out the hidden tags and their content before final formatting.
        positive_prompt = re.sub(r'###HIDDEN_START###.*?###HIDDEN_END###', '', positive_prompt)
        
        positive_prompt = ", ".join(filter(None, [p.strip() for p in re.sub(r'\s+', ' ', positive_prompt).strip().split(',')]))
        return positive_prompt, negative_prompt

