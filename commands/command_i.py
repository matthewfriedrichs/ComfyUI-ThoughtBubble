import re
import itertools

# --- HELPER FUNCTIONS ---

def _parse_weight(weight_str):
    """
    Parses a weight string into an integer step count.
    'item:3' means wait 3 steps. 'item' means 1 step.
    """
    try:
        weight_val = float(weight_str.strip())
        if weight_val >= 1:
            return int(weight_val)
    except (ValueError, TypeError):
        pass
    return 1 # Default weight is 1 step

def _get_list_from_content(parser, content_str):
    """
    Takes a raw content string (e.g., "a|b|c") and returns
    a list of strings, respecting | as a delimiter.
    Handles wildcard file lookup.
    """
    options = parser._split_toplevel_options(content_str)
    
    # Check for single-item wildcard file
    if len(options) == 1:
        wildcard_name = options[0].strip().lower()
        if wildcard_name in parser.wildcards:
            return parser.wildcards[wildcard_name]
    
    # Not a wildcard file, or it's an inline list.
    # We must re-split the original string to correctly handle `a|b` vs `a`
    return parser._split_toplevel_options(content_str, delimiter='|')

def _i_expand_template(parser, template_string):
    """
    Expands a template string like "(a|b) c" into ["ac", "bc"].
    Also handles single items like "a" -> ["a"].
    """
    parts, sub_lists, cursor = [], [], 0
    
    # Find all top-level parenthesized groups
    paren_regex = re.compile(r'\(')
    
    match = paren_regex.search(template_string, cursor)
    
    # If no parentheses, it's not a template, just a list of items.
    if not match:
        # This is the fix: treat the whole string as a list of options
        return _get_list_from_content(parser, template_string)

    # Found parentheses, proceed with N-D template expansion
    while cursor < len(template_string):
        match = paren_regex.search(template_string, cursor)
        
        if not match:
            # Add the trailing part of the string
            parts.append(template_string[cursor:])
            break

        paren_start = match.start()
        paren_end = parser._find_matching_paren(template_string, paren_start)

        if paren_end == -1:
            # Malformed, add the rest of the string
            parts.append(template_string[cursor:])
            break
            
        # Add the text before the parenthesis
        parts.append(template_string[cursor:paren_start])
        
        # Get the content inside the parens and expand it
        sub_content = template_string[paren_start + 1:paren_end]
        sub_lists.append(_get_list_from_content(parser, sub_content))
        parts.append(None) # Placeholder for an expanded item
        
        cursor = paren_end + 1
    
    if not sub_lists:
        return [template_string]

    # Generate all combinations
    final_list = []
    for combo in itertools.product(*sub_lists):
        result_parts = []
        combo_iter = iter(combo)
        for part in parts:
            if part is None:
                result_parts.append(next(combo_iter, ''))
            else:
                result_parts.append(part)
        # We must NOT filter(None) here, as empty strings are valid
        final_list.append("".join(result_parts))
        
    return final_list

def _get_weighted_list(parser, raw_dimension_str):
    """
    Takes a raw dimension string, expands it if it's a template,
    and returns a list of (text, weight) tuples.
    """
    expanded_options = _i_expand_template(parser, raw_dimension_str)
    
    weighted_list = []
    for item in expanded_options:
        text = item
        weight = 1
        
        if ':' in item:
            try:
                parts = item.rsplit(':', 1)
                # Try to parse the part after the colon as a weight
                parsed_weight = _parse_weight(parts[1])
                if parsed_weight > 1 or (parsed_weight == 1 and parts[1].strip() == '1'):
                    # It's a valid weight
                    text = parts[0]
                    weight = parsed_weight
            except (ValueError, IndexError):
                # Not a valid weight, treat the whole string as text
                pass
        
        # Unlike w(), i() MUST preserve whitespace. Do not strip().
        weighted_list.append((text, weight))
    
    return weighted_list

def _get_item_at_index(weighted_list, index):
    """
    Given a weighted list [('a', 2), ('b', 1)] and an index,
    finds the correct item.
    Index 0 -> 'a', Index 1 -> 'a', Index 2 -> 'b'
    """
    if not weighted_list:
        return ""
        
    total_weight = sum(w for t, w in weighted_list)
    if total_weight == 0:
        return ""
        
    # Modulo the index by the total weight to loop
    target_index = int(index) % total_weight
    
    current_index = 0
    for text, weight in weighted_list:
        if current_index <= target_index < current_index + weight:
            return text
        current_index += weight
        
    # Fallback (shouldn't be reached, but good for safety)
    return weighted_list[0][0]

# --- MAIN EXECUTE FUNCTION ---

def execute(parser, content, **kwargs):
    start_index = kwargs.get('start_index', 0)
    linked_var_id = parser.command_links.get(str(start_index))
    current_iterator = parser.control_vars_by_id.get(linked_var_id, parser.iterator)
    
    raw_content = content.strip()
    
    # --- NEW is_nd LOGIC ---
    # An N-D list MUST have parentheses AND a top-level pipe.
    # 1. i(a|b)           -> has_paren=F, has_toplevel_pipe=T => is_nd=F (1D)
    # 2. i((a|b) c)      -> has_paren=T, has_toplevel_pipe=F => is_nd=F (1D Template)
    # 3. i((a|b)|c)      -> has_paren=T, has_toplevel_pipe=T => is_nd=T (N-D)
    
    has_paren = '(' in raw_content or ')' in raw_content
    
    balance = 0
    has_toplevel_pipe = False
    for char in raw_content:
        if char == '(': balance += 1
        elif char == ')': balance -= 1
        elif char == '|' and balance == 0:
            has_toplevel_pipe = True
            break
    
    is_nd = has_paren and has_toplevel_pipe
    # --- END NEW is_nd LOGIC ---
    
    if is_nd:
        # N-DIMENSIONAL LOGIC
        dim_strings = parser._split_toplevel_options(raw_content, delimiter='|')
        dimensions = [_get_weighted_list(parser, d) for d in dim_strings]
        
        if not all(dimensions):
            return "" # One of the dimensions was empty

        selected_texts = []
        odometer_val = int(current_iterator)

        for dim in reversed(dimensions):
            total_weight = sum(w for t, w in dim)
            if total_weight == 0:
                selected_texts.append("")
                continue
                
            current_index = odometer_val % total_weight
            odometer_val //= total_weight
            
            selected_texts.append(_get_item_at_index(dim, current_index))
            
        selected_text = "".join(reversed(selected_texts))
        
    else:
        # 1-DIMENSIONAL LOGIC (e.g., "a|b|c" or "(a|b) c")
        weighted_list = _get_weighted_list(parser, raw_content)
        if not weighted_list:
            return ""
        selected_text = _get_item_at_index(weighted_list, current_iterator)

    # NEW: Recursive wildcard logic (SEQUENTIAL)
    # Check if the selected item is *itself* a wildcard file
    selected_text_lower = selected_text.strip().lower()
    if selected_text_lower in parser.wildcards:
        # If so, pick a *sequential* item from that file
        recursive_options = parser.wildcards[selected_text_lower]
        if recursive_options:
            # Use the iterator to pick, and do not strip whitespace
            return recursive_options[int(current_iterator) % len(recursive_options)]

    return selected_text

