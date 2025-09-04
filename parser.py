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
            v_match = re.search(r'\b[vV]\s*\(', text[cursor:])
            m_match = re.search(r'-\s*\(', text[cursor:])
            s_if_match = re.search(r'\?\s*\(', text[cursor:])
            m_if_match = re.search(r'\?\?\s*\(', text[cursor:])
            h_match = re.search(r'\b[hH]\s*\(', text[cursor:])
            f_match = re.search(r'\b[fF]\s*\(', text[cursor:])
            lora_match = re.search(r'\b(lora|lra)\s*\(', text[cursor:], re.IGNORECASE)
            wildcard_match = re.search(r'\b[wW]\s*\(', text[cursor:])
            random_match = re.search(r'\b[rR]\s*\(', text[cursor:])
            
            v_pos, m_pos, s_if_pos, m_if_pos, h_pos, f_pos, lora_pos, w_pos, r_pos = -1,-1,-1,-1,-1,-1,-1,-1,-1
            if v_match: v_pos = v_match.start() + cursor
            if m_match: m_pos = m_match.start() + cursor
            if s_if_match: s_if_pos = s_if_match.start() + cursor
            if m_if_match: m_if_pos = m_if_match.start() + cursor
            if h_match: h_pos = h_match.start() + cursor
            if f_match: f_pos = f_match.start() + cursor
            if lora_match: lora_pos = lora_match.start() + cursor
            if wildcard_match: w_pos = wildcard_match.start() + cursor
            if random_match: r_pos = random_match.start() + cursor

            if s_if_pos == m_if_pos: s_if_pos = -1
            
            positions = [p for p in [v_pos, m_pos, s_if_pos, m_if_pos, h_pos, f_pos, lora_pos, w_pos, r_pos] if p != -1]
            
            if not positions:
                if cursor < len(text): tokens.append(Token('LITERAL', text[cursor:]))
                break
            
            start_index = min(positions)
            if start_index > cursor:
                tokens.append(Token('LITERAL', text[cursor:start_index]))
            
            paren_start = text.find('(', start_index)
            paren_end = self._find_matching_paren(text, paren_start)
            if paren_end == -1:
                tokens.append(Token('LITERAL', text[start_index:]))
                break
            
            if start_index == m_if_pos: command_type = 'MULTI_IF_COMMAND'
            elif start_index == s_if_pos: command_type = 'IF_COMMAND'
            elif start_index == h_pos: command_type = 'HIDDEN_COMMAND'
            elif start_index == f_pos: command_type = 'FORCE_COMMAND'
            elif start_index == lora_pos: command_type = 'LORA_COMMAND'
            elif start_index == w_pos: command_type = 'WILDCARD_COMMAND'
            elif start_index == r_pos: command_type = 'RANDOM_COMMAND'
            elif start_index == v_pos: command_type = 'V_COMMAND'
            else: command_type = 'NEG_COMMAND'
            
            command_content = text[paren_start + 1 : paren_end]
            tokens.append(Token(command_type, command_content))
            cursor = paren_end + 1
        return tokens

    def _parse_random_command(self, content):
        """
        Parses the random command r() to generate a random number.
        - r(max) -> random number between 0 and max.
        - r(min|max) -> random number between min and max.
        Type (int/float) is inferred from the input.
        """
        parts = content.split('|')
        
        try:
            if len(parts) == 1:
                # Single argument: r(max), range is [0, max]
                max_val_str = parts[0].strip()
                if not max_val_str: raise ValueError("Max value cannot be empty.")
                
                if '.' in max_val_str:
                    max_val = float(max_val_str)
                    return str(self.rng.uniform(0.0, max_val))
                else:
                    max_val = int(max_val_str)
                    return str(self.rng.randint(0, max_val))

            elif len(parts) == 2:
                # Two arguments: r(min|max)
                min_val_str = parts[0].strip()
                max_val_str = parts[1].strip()
                if not min_val_str or not max_val_str: raise ValueError("Min or max value cannot be empty.")
                
                if '.' in min_val_str or '.' in max_val_str:
                    min_val = float(min_val_str)
                    max_val = float(max_val_str)
                    if min_val > max_val: min_val, max_val = max_val, min_val
                    return str(self.rng.uniform(min_val, max_val))
                else:
                    min_val = int(min_val_str)
                    max_val = int(max_val_str)
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
        Handles nested commands and recursive resolution.
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
                    chosen_line = self.rng.choice(lines)
                    return self._resolve_text(chosen_line, used_sections)
            
            print(f"Thought Bubble Warning: Wildcard file '{wildcard_name}.txt' not found or is empty.")
            return f"w({content})"


    def _parse_lora_command(self, content):
        """
        Parses a lora command, resolving any nested commands in strength values.
        """
        try:
            parts = content.split(':')
            name = parts[0].strip()
            model_strength_str = "1.0"
            clip_strength_str = "1.0"

            if len(parts) == 2:
                model_strength_str = parts[1]
                clip_strength_str = model_strength_str # Use same strength for clip
            elif len(parts) == 3:
                model_strength_str = parts[1]
                clip_strength_str = parts[2]
            elif len(parts) > 3:
                # Handle cases where the LoRA name itself might contain colons
                name = ":".join(parts[:-2]).strip()
                model_strength_str = parts[-2]
                clip_strength_str = parts[-1]
            else:
                # This covers len(parts) == 1, which is just the name with default strength
                pass
            resolved_model_strength = self._resolve_text(model_strength_str.strip(), set())
            resolved_clip_strength = self._resolve_text(clip_strength_str.strip(), set())

            model_strength = float(resolved_model_strength)
            clip_strength = float(resolved_clip_strength)
            
            self.loras_to_load.append((name, model_strength, clip_strength))
        except (ValueError, IndexError) as e:
            print(f"Thought Bubble Warning: Malformed lora command: '{content}'. Error: {e}")
        return ""

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
        sections, triggered_outputs = content.split('|'), []
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
        return "".join(resolved_parts)

    def parse(self, text):
        self.used_multi_if_sections = set()
        self.loras_to_load = []
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