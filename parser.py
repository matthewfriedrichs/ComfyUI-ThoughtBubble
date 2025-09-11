import re
import os
import random
from collections import namedtuple

Token = namedtuple('Token', ['kind', 'value'])

class CanvasParser:
    """
    The main grammar engine. It now uses a seeded random generator for wildcards.
    """
    def __init__(self, box_map, wildcard_data, rng):
        self.box_map = {k.lower(): v for k, v in box_map.items()}
        self.wildcards = wildcard_data
        self.rng = rng
        self.used_multi_if_sections = set()
        self.hidden_start_marker = "###H###"
        self.hidden_end_marker = "###/H###"
        self.is_forcing = False
        self.loras_to_load = []
        self.areas_to_apply = [] # New: To track which area boxes to use

    def _find_matching_paren(self, text, start_index):
        depth = 1
        for i in range(start_index + 1, len(text)):
            if text[i] == '(': depth += 1
            elif text[i] == ')': depth -= 1
            if depth == 0: return i
        return -1
    
    def _split_toplevel_options(self, text, delimiter='|'):
        """Splits a string by a delimiter, but ignores delimiters inside parentheses."""
        parts = []
        balance = 0
        last_split = 0
        for i, char in enumerate(text):
            if char == '(':
                balance += 1
            elif char == ')':
                balance -= 1
            elif char == delimiter and balance == 0:
                parts.append(text[last_split:i])
                last_split = i + 1
        parts.append(text[last_split:])
        return parts

    def _tokenize(self, text):
        tokens = []
        cursor = 0
        while cursor < len(text):
            # Added area command 'a(' to the regex search
            searches = {
                'V_COMMAND': re.search(r'\b[vV]\s*\(', text[cursor:]),
                'NEG_COMMAND': re.search(r'-\s*\(', text[cursor:]),
                'IF_COMMAND': re.search(r'\?\s*\(', text[cursor:]),
                'MULTI_IF_COMMAND': re.search(r'\?\?\s*\(', text[cursor:]),
                'HIDDEN_COMMAND': re.search(r'\b[hH]\s*\(', text[cursor:]),
                'FORCE_COMMAND': re.search(r'\b[fF]\s*\(', text[cursor:]),
                'LORA_COMMAND': re.search(r'\b(lora|lra)\s*\(', text[cursor:], re.IGNORECASE),
                'WILDCARD_COMMAND': re.search(r'\b[wW]\s*\(', text[cursor:]),
                'RANDOM_COMMAND': re.search(r'\b[rR]\s*\(', text[cursor:]),
                'AREA_COMMAND': re.search(r'\b[aA]\s*\(', text[cursor:]), # New Area Command
            }
            
            # Find the first upcoming command
            first_pos = float('inf')
            first_kind = None
            for kind, match in searches.items():
                if match and (match.start() + cursor) < first_pos:
                    first_pos = match.start() + cursor
                    first_kind = kind
            
            if first_kind is None:
                if cursor < len(text): tokens.append(Token('LITERAL', text[cursor:]))
                break

            # Add the literal text before the command
            if first_pos > cursor:
                tokens.append(Token('LITERAL', text[cursor:first_pos]))

            # Process the found command
            paren_start = text.find('(', first_pos)
            paren_end = self._find_matching_paren(text, paren_start)
            if paren_end == -1:
                tokens.append(Token('LITERAL', text[first_pos:]))
                break

            command_content = text[paren_start + 1 : paren_end]
            tokens.append(Token(first_kind, command_content))
            cursor = paren_end + 1
            
        return tokens

    def _parse_random_command(self, content):
        """
        Parses the random command r() to generate a random number.
        """
        parts = content.split('|')
        try:
            if len(parts) == 1:
                max_val_str = parts[0].strip()
                if not max_val_str: raise ValueError("Max value cannot be empty.")
                if '.' in max_val_str: return str(self.rng.uniform(0.0, float(max_val_str)))
                else: return str(self.rng.randint(0, int(max_val_str)))
            elif len(parts) == 2:
                min_val_str, max_val_str = parts[0].strip(), parts[1].strip()
                if not min_val_str or not max_val_str: raise ValueError("Min or max value cannot be empty.")
                if '.' in min_val_str or '.' in max_val_str:
                    min_val, max_val = float(min_val_str), float(max_val_str)
                    if min_val > max_val: min_val, max_val = max_val, min_val
                    return str(self.rng.uniform(min_val, max_val))
                else:
                    min_val, max_val = int(min_val_str), int(max_val_str)
                    if min_val > max_val: min_val, max_val = max_val, min_val
                    return str(self.rng.randint(min_val, max_val))
            else:
                print(f"Thought Bubble Warning: Invalid number of arguments for random command: 'r({content})'")
                return f"r({content})"
        except (ValueError, IndexError):
            print(f"Thought Bubble Warning: Could not parse numbers in random command: 'r({content})'.")
            return f"r({content})"

    def _parse_wildcard_command(self, content, used_sections):
        """
        Selects a random item from a wildcard file or an inline list.
        """
        options = self._split_toplevel_options(content)
        if len(options) > 1:
            chosen_option = self.rng.choice(options).strip()
            return self._resolve_text(chosen_option, used_sections)
        else:
            resolved_content = self._resolve_text(content, used_sections)
            final_options = self._split_toplevel_options(resolved_content)
            if len(final_options) > 1:
                chosen_final_option = self.rng.choice(final_options).strip()
                return self._resolve_text(chosen_final_option, used_sections)
            wildcard_name = resolved_content.strip().lower()
            if wildcard_name in self.wildcards:
                lines = self.wildcards[wildcard_name]
                if lines:
                    return self._resolve_text(self.rng.choice(lines), used_sections)
            print(f"Thought Bubble Warning: Wildcard file '{wildcard_name}.txt' not found or is empty.")
            return f"w({content})"

    def _parse_lora_command(self, content):
        """
        Parses a lora command, resolving any nested commands in strength values.
        """
        try:
            parts = content.split(':')
            name = parts[0].strip()
            model_strength_str, clip_strength_str = "1.0", "1.0"
            if len(parts) == 2: model_strength_str = clip_strength_str = parts[1]
            elif len(parts) >= 3:
                name = ":".join(parts[:-2]).strip() if len(parts) > 3 else parts[0].strip()
                model_strength_str, clip_strength_str = parts[-2], parts[-1]
            
            resolved_model_strength = self._resolve_text(model_strength_str.strip(), set())
            resolved_clip_strength = self._resolve_text(clip_strength_str.strip(), set())
            self.loras_to_load.append((name, float(resolved_model_strength), float(resolved_clip_strength)))
        except (ValueError, IndexError) as e:
            print(f"Thought Bubble Warning: Malformed lora command: '{content}'. Error: {e}")
        return ""

    def _parse_area_command(self, content):
        """ Registers an area box to be applied later, preserving order. """
        area_title = content.strip().lower()
        if area_title:
            self.areas_to_apply.append(area_title)
        return "" # This command produces no text output

    def _parse_force_command(self, content, used_sections):
        self.is_forcing = True
        result = self._resolve_text(content, used_sections)
        self.is_forcing = False
        return result

    def _parse_if_command(self, content, context, used_sections):
        parts = content.split('|')
        if len(parts) < 2: return ""
        keywords = [k.strip().lower() for k in parts[0].split(',') if k.strip()]
        true_text, false_text = parts[1], parts[2] if len(parts) > 2 else ""
        condition_met = any(re.search(r'\b' + re.escape(k) + r'\b', context.lower()) for k in keywords)
        return self._resolve_text(true_text if condition_met else false_text, used_sections)

    def _parse_multi_if_command(self, content, context, used_sections):
        sections, triggered_outputs = self._split_toplevel_options(content), []
        for section in sections:
            parts = section.split(':', 1)
            if len(parts) != 2: continue
            keywords_str, output_text = parts
            section_id = (keywords_str.strip(), output_text.strip())
            if section_id in used_sections: continue
            keywords = [k.strip().lower() for k in keywords_str.split(',') if k.strip()]
            if any(re.search(r'\b' + re.escape(k) + r'\b', context.lower()) for k in keywords):
                triggered_outputs.append(output_text)
                used_sections.add(section_id)
        resolved_outputs = [self._resolve_text(text, used_sections) for text in triggered_outputs]
        return ", ".join(filter(None, resolved_outputs))

    def _parse_v_content(self, expression, used_sections):
        parts = re.split(r'([+-])', expression)
        first_operand_name = parts[0].strip()
        current_result = self._resolve_operand(first_operand_name, used_sections)
        for i in range(1, len(parts), 2):
            operator, operand_name = parts[i].strip(), parts[i+1].strip()
            operand_content = self._resolve_operand(operand_name, used_sections)
            if operator == '+': current_result = f"{current_result}, {operand_content}"
            elif operator == '-': current_result = f"{current_result}, {self._invert_expression(operand_content)}"
        return current_result
        
    def _resolve_operand(self, name, used_sections):
        title = name.lower()
        text_to_parse = self.box_map.get(title, name)
        stripped_text = text_to_parse.strip()
        if not self.is_forcing and (stripped_text.startswith('?(') or stripped_text.startswith('??(')):
            return text_to_parse
        return self._resolve_text(text_to_parse, used_sections)

    def _split_prompt(self, text):
        negative_parts = re.findall(r'-\((.*?)\)', text, re.DOTALL)
        negative_prompt = ", ".join(p.strip() for p in negative_parts if p.strip())
        positive_prompt = re.sub(r'-\([^)]*\)', '', text)
        positive_prompt = re.sub(r'\s+', ' ', positive_prompt).strip()
        positive_prompt = ", ".join(filter(None, [p.strip() for p in positive_prompt.split(',')]))
        return positive_prompt, negative_prompt

    def _invert_expression(self, text):
        pos, neg = self._split_prompt(text)
        flipped_parts = []
        if neg: flipped_parts.append(neg)
        if pos: flipped_parts.append(f"-({pos})")
        return " ".join(flipped_parts)

    def _resolve_text(self, text, used_sections):
        if not text or not text.strip(): return ""
        tokens = self._tokenize(text)
        resolved_parts = []
        for kind, value in tokens:
            if kind == 'LITERAL': resolved_parts.append(value)
            elif kind == 'V_COMMAND': resolved_parts.append(self._parse_v_content(value, used_sections))
            elif kind == 'NEG_COMMAND': resolved_parts.append(self._invert_expression(self._resolve_text(value, used_sections)))
            elif kind == 'IF_COMMAND': resolved_parts.append(self._parse_if_command(value, "".join(resolved_parts), used_sections))
            elif kind == 'MULTI_IF_COMMAND': resolved_parts.append(self._parse_multi_if_command(value, "".join(resolved_parts), used_sections))
            elif kind == 'HIDDEN_COMMAND': resolved_parts.append(f"{self.hidden_start_marker}{self._resolve_text(value, used_sections)}{self.hidden_end_marker}")
            elif kind == 'FORCE_COMMAND': resolved_parts.append(self._parse_force_command(value, used_sections))
            elif kind == 'LORA_COMMAND': resolved_parts.append(self._parse_lora_command(value))
            elif kind == 'WILDCARD_COMMAND': resolved_parts.append(self._parse_wildcard_command(value, used_sections))
            elif kind == 'RANDOM_COMMAND': resolved_parts.append(self._parse_random_command(value))
            elif kind == 'AREA_COMMAND': resolved_parts.append(self._parse_area_command(value))
        return "".join(resolved_parts)

    def parse(self, text):
        self.used_multi_if_sections = set()
        self.loras_to_load = []
        self.areas_to_apply = [] 
        current_text = text
        for _ in range(20):
            resolved_text = self._resolve_text(current_text, self.used_multi_if_sections)
            if resolved_text == current_text: break
            current_text = resolved_text
        start_marker, end_marker = re.escape(self.hidden_start_marker), re.escape(self.hidden_end_marker)
        hidden_pattern = re.compile(f"{start_marker}.*?{end_marker}", re.DOTALL)
        final_text = hidden_pattern.sub('', current_text)
        pos, neg = self._split_prompt(final_text)
        return pos, neg

