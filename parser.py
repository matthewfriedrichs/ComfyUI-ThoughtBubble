import re
import os
import random
from collections import namedtuple
import itertools

Token = namedtuple('Token', ['kind', 'value', 'start', 'end'])

class CanvasParser:
    def __init__(self, box_map, wildcard_data, rng, iterator=0, control_vars_by_id=None, control_vars_by_name=None, command_links=None):
        self.box_map = {k.lower(): v for k, v in box_map.items()}
        self.wildcards = wildcard_data
        self.rng = rng
        self.iterator = iterator
        self.variables = {}
        self.control_vars_by_id = control_vars_by_id if control_vars_by_id is not None else {}
        self.control_vars_by_name = control_vars_by_name if control_vars_by_name is not None else {}
        self.command_links = command_links if command_links is not None else {}
        
        self.COMMAND_PRIORITY = [
            'HIDDEN_COMMAND', 'V_COMMAND', 
            'I_COMMAND', 'WILDCARD_COMMAND', 'RANDOM_COMMAND',
            'NEG_COMMAND', 'IF_COMMAND', 'MULTI_IF_COMMAND',
            'LORA_COMMAND', 'AREA_COMMAND', 'FORCE_COMMAND'
        ]

    # ... (_find_matching_paren, _split_toplevel_options, _get_list_from_content, _expand_template_dimension are unchanged) ...
    def _find_matching_paren(self, text, start_index):
        depth = 1
        for i in range(start_index + 1, len(text)):
            if text[i] == '(': depth += 1
            elif text[i] == ')': depth -= 1
            if depth == 0: return i
        return -1

    def _split_toplevel_options(self, text, delimiter='|'):
        parts = []
        balance = 0
        last_split = 0
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
        if len(options) == 1:
            wildcard_name = options[0].strip().lower()
            if wildcard_name in self.wildcards:
                return self.wildcards[wildcard_name]
        return options

    def _expand_template_dimension(self, template_string):
        parts = []
        sub_lists = []
        cursor = 0
        command_regex = re.compile(r'\b[iw]\s*\(|\(')

        while cursor < len(template_string):
            match = command_regex.search(template_string, cursor)
            if not match:
                parts.append(template_string[cursor:])
                break
            
            paren_start = template_string.find('(', match.start())
            paren_end = self._find_matching_paren(template_string, paren_start)
            if paren_end == -1:
                parts.append(template_string[cursor:])
                break

            parts.append(template_string[cursor:match.start()])
            
            sub_list_content = template_string[paren_start + 1:paren_end]
            sub_lists.append(self._get_list_from_content(sub_list_content))
            
            parts.append(None)
            cursor = paren_end + 1
            
        if not sub_lists:
            return [template_string]

        combinations = list(itertools.product(*sub_lists))
        
        final_list = []
        for combo in combinations:
            temp_combo = list(combo)
            result_str = ""
            for part in parts:
                result_str += temp_combo.pop(0) if part is None else part
            final_list.append(self._recursive_resolve(result_str))
        return final_list


    # The dispatcher now passes the command's start index to the relevant functions
    def _parse_command(self, kind, value, start_index):
        if kind == 'I_COMMAND': return self._parse_iterator_command(value, start_index)
        if kind == 'V_COMMAND': return self._parse_v_content(value)
        if kind == 'NEG_COMMAND': return self._invert_expression(value)
        if kind == 'IF_COMMAND': return self._parse_if_command(value, "") 
        if kind == 'MULTI_IF_COMMAND': return self._parse_multi_if_command(value, "")
        if kind == 'HIDDEN_COMMAND': return "" 
        if kind == 'FORCE_COMMAND': return self._recursive_resolve(value)
        if kind == 'LORA_COMMAND': return self._parse_lora_command(value)
        if kind == 'WILDCARD_COMMAND': return self._parse_wildcard_command(value, start_index)
        if kind == 'RANDOM_COMMAND': return self._parse_random_command(value)
        if kind == 'AREA_COMMAND': return self._parse_area_command(value)
        return ""

    def _recursive_resolve(self, text):
        while True:
            searches = {
                'I_COMMAND': list(re.finditer(r'\b[iI]\s*\(', text)),
                'V_COMMAND': list(re.finditer(r'\b[vV]\s*\(', text)),
                'NEG_COMMAND': list(re.finditer(r'-\s*\(', text)),
                'IF_COMMAND': list(re.finditer(r'\?\s*\(', text)),
                'MULTI_IF_COMMAND': list(re.finditer(r'\?\?\s*\(', text)),
                'HIDDEN_COMMAND': list(re.finditer(r'\b[hH]\s*\(', text)),
                'FORCE_COMMAND': list(re.finditer(r'\b[fF]\s*\(', text)),
                'LORA_COMMAND': list(re.finditer(r'\b(lora|lra)\s*\(', text, re.IGNORECASE)),
                'WILDCARD_COMMAND': list(re.finditer(r'\b[wW]\s*\(', text)),
                'RANDOM_COMMAND': list(re.finditer(r'\b[rR]\s*\(', text)),
                'AREA_COMMAND': list(re.finditer(r'\b[aA]\s*\(', text)),
            }

            innermost_command = None
            max_depth = -1
            all_matches = [match for kind in self.COMMAND_PRIORITY for match in searches.get(kind, [])]

            for match in all_matches:
                depth = text[:match.start()].count('(') - text[:match.start()].count(')')
                if depth > max_depth:
                    max_depth = depth
                    innermost_command = match

            if innermost_command is None:
                break

            kind = next(k for k, v in searches.items() if innermost_command in v)
            
            paren_start = text.find('(', innermost_command.start())
            paren_end = self._find_matching_paren(text, paren_start)
            if paren_end == -1: break

            content = text[paren_start + 1:paren_end]
            resolved_content = self._recursive_resolve(content)
            
            if kind in ['IF_COMMAND', 'MULTI_IF_COMMAND']:
                 context = text[:innermost_command.start()]
                 result = self._parse_if_command(resolved_content, context) if kind == 'IF_COMMAND' else self._parse_multi_if_command(resolved_content, context)
            else:
                 # Pass the command's start index to the parser function
                 result = self._parse_command(kind, resolved_content, innermost_command.start())

            text = text[:innermost_command.start()] + result + text[paren_end + 1:]

        return text

    def parse(self, text):
        # ... (this is unchanged)
        self.variables = {}
        self.loras_to_load = []
        self.areas_to_apply = []
        
        resolved_text = self._recursive_resolve(text)
        
        negative_parts = re.findall(r'###NEG###(.*?)###/NEG###', resolved_text, re.DOTALL)
        negative_prompt = ", ".join(p.strip() for p in negative_parts if p.strip())
        
        positive_prompt = re.sub(r'###NEG###.*?###/NEG###', '', resolved_text)
        positive_prompt = re.sub(r'\s+', ' ', positive_prompt).strip()
        positive_prompt = ", ".join(filter(None, [p.strip() for p in positive_prompt.split(',')]))

        return positive_prompt, negative_prompt

    def _parse_iterator_command(self, content, start_index):
        # Check if this command is linked to a custom variable ID
        linked_var_id = self.command_links.get(str(start_index))
        
        # Use the linked variable's value if it exists, otherwise use the default
        current_iterator = self.control_vars_by_id.get(linked_var_id, self.iterator)
        
        stripped_content = content.strip()
        dimensions_str = self._split_toplevel_options(stripped_content)
        
        is_multidimensional = False
        if len(dimensions_str) > 1:
            is_multidimensional = any(
                (d.strip().startswith('(') and d.strip().endswith(')')) or ('(' in d and ')' in d)
                for d in dimensions_str
            )
        
        if is_multidimensional:
            dimensions = [self._expand_template_dimension(d.strip()) for d in dimensions_str]
            if not all(dimensions): return f"i({content})"
            
            num_dims = len(dimensions)
            dim_lengths = [len(d) for d in dimensions]
            if any(l == 0 for l in dim_lengths): return f"i({content})"

            selected_items = []
            for i in range(num_dims):
                product_of_faster_dims = 1
                for j in range(i + 1, num_dims):
                    product_of_faster_dims *= dim_lengths[j]
                
                index = (int(current_iterator) // product_of_faster_dims) % dim_lengths[i]
                selected_items.append(dimensions[i][index])
            return "".join(selected_items)
        else:
            final_options_list = self._get_list_from_content(stripped_content)
            if not final_options_list: return stripped_content
            index = int(current_iterator) % len(final_options_list)
            return final_options_list[index].strip()

    def _parse_wildcard_command(self, content, start_index):
        # Check for a linked seed variable ID
        linked_var_id = self.command_links.get(str(start_index))
        
        # Use a new RNG instance if a custom seed is linked, otherwise use the default
        rng_instance = self.rng
        if linked_var_id and linked_var_id in self.control_vars_by_id:
            custom_seed = self.control_vars_by_id[linked_var_id]
            rng_instance = random.Random()
            rng_instance.seed(custom_seed)

        options = self._get_list_from_content(content)
        return rng_instance.choice(options).strip() if options else ""

    # ... (the rest of the file is unchanged) ...
    def _invert_expression(self, text):
        return f"###NEG###{text}###/NEG###"

    def _parse_v_content(self, expression):
        parts = self._split_toplevel_options(expression, delimiter='|')
        if len(parts) == 2:
            var_name = parts[0].strip().lower()
            self.variables[var_name] = parts[1].strip()
            return ""

        expression = self.control_vars_by_name.get(expression.strip().lower(), expression)

        parts = re.split(r'([+-])', str(expression))
        current_result = self._resolve_operand(parts[0].strip())
        i = 1
        while i < len(parts):
            operator, operand_name = parts[i].strip(), parts[i+1].strip()
            operand_content = self._resolve_operand(operand_name)
            if operator == '+':
                current_result = f"{current_result}, {operand_content}"
            elif operator == '-':
                current_result = f"{current_result}, {self._invert_expression(operand_content)}"
            i += 2
        return current_result
        
    def _resolve_operand(self, name):
        title = name.lower()
        if title in self.control_vars_by_name:
            return str(self.control_vars_by_name[title])
        if title in self.variables:
            return self.variables[title]
        return self.box_map.get(title, name)
        
    def _parse_if_command(self, content, context):
        parts = self._split_toplevel_options(content)
        if len(parts) < 2: return ""
        keywords = [k.strip().lower() for k in parts[0].split(',') if k.strip()]
        true_text, false_text = parts[1], parts[2] if len(parts) > 2 else ""
        condition_met = any(re.search(r'\b' + re.escape(k) + r'\b', context.lower()) for k in keywords)
        return true_text if condition_met else false_text

    def _parse_multi_if_command(self, content, context):
        sections = self._split_toplevel_options(content)
        for section in sections:
            parts = section.split(':', 1)
            if len(parts) != 2: continue
            keywords = [k.strip().lower() for k in parts[0].split(',') if k.strip()]
            if any(re.search(r'\b' + re.escape(k) + r'\b', context.lower()) for k in keywords):
                return parts[1]
        return ""

    def _parse_random_command(self, content):
        parts = content.split('|')
        try:
            if len(parts) == 1:
                max_val = float(parts[0]) if '.' in parts[0] else int(parts[0])
                return str(self.rng.uniform(0, max_val) if isinstance(max_val, float) else self.rng.randint(0, max_val))
            elif len(parts) == 2:
                min_val = float(parts[0]) if '.' in parts[0] else int(parts[0])
                max_val = float(parts[1]) if '.' in parts[1] else int(parts[1])
                if min_val > max_val: min_val, max_val = max_val, min_val
                return str(self.rng.uniform(min_val, max_val) if isinstance(min_val, float) else self.rng.randint(min_val, max_val))
        except (ValueError, IndexError):
            pass
        return f"r({content})"

    def _parse_lora_command(self, content):
        try:
            parts = content.split(':')
            name = parts[0].strip()
            model_strength = float(parts[1].strip())
            clip_strength = float(parts[2].strip()) if len(parts) > 2 else model_strength
            self.loras_to_load.append((name, model_strength, clip_strength))
        except (ValueError, IndexError):
            pass
        return ""

    def _parse_area_command(self, content):
        self.areas_to_apply.append(content.strip().lower())
        return ""