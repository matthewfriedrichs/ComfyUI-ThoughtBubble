# filename: thoughtbubble/commands/command_i.py

import re
import itertools

def _parse_weight(weight_str):
    """
    Parses a weight string into an integer.
    Weights are steps, so they must be whole numbers >= 1.
    """
    try:
        # We'll allow floats but round them, defaulting to 1
        weight = int(round(float(weight_str.strip())))
        return max(1, weight) # Weight must be at least 1
    except ValueError:
        print(f"ThoughtBubble: Invalid weight format '{weight_str}' in i(). Defaulting to 1.")
        return 1

def _get_weighted_options(parser, options_list):
    """
    Parses a list of content strings into a list of (text, weight) tuples
    and returns the list and the total weight (total steps).
    """
    weighted_list = []
    total_weight = 0
    if not options_list:
        return [], 0
        
    for item in options_list:
        text = item.strip()
        weight = 1
        
        try:
            # Use rsplit to only split on the last colon
            text, weight_str = text.rsplit(':', 1)
            text = text.strip()
            weight = _parse_weight(weight_str)
        except ValueError:
            # No colon or invalid weight, treat as weight 1
            pass
            
        # Correctly append all items, including empty strings
        weighted_list.append((text, weight))
        total_weight += weight
            
    return weighted_list, total_weight

def _get_item_from_weighted_list(weighted_list, index_step):
    """
    Finds the correct item in a weighted list given an index step.
    e.g., [("a", 2), ("b", 1)] at index_step 1 returns "a".
    e.g., [("a", 2), ("b", 1)] at index_step 2 returns "b".
    """
    if not weighted_list:
        return ""
        
    current_step = 0
    for (text, weight) in weighted_list:
        if current_step <= index_step < current_step + weight:
            return text
        current_step += weight
        
    # Fallback in case of index error (shouldn't happen with modulo)
    return weighted_list[0][0]

def _i_expand_template(parser, template_string):
    """
    Expands a template string like "(a|b) c" into ["ac", "bc"].
    This function handles finding parentheses and creating combinations.
    """
    parts, sub_lists, cursor = [], [], 0
    regex = re.compile(r'\(') 
    
    while cursor < len(template_string):
        match = regex.search(template_string, cursor)
        if not match: 
            parts.append(template_string[cursor:])
            break
            
        paren_start = match.start()
        paren_end = parser._find_matching_paren(template_string, paren_start)
        if paren_end == -1: 
            parts.append(template_string[cursor:])
            break
            
        parts.append(template_string[cursor:paren_start])
        
        # Get the list of options inside the parentheses
        sub_content = template_string[paren_start + 1:paren_end]
        # Split the sub-content by the | delimiter
        sub_lists.append(parser._split_toplevel_options(sub_content, delimiter='|'))
        
        parts.append(None) # Placeholder for where the sub-list item will go
        cursor = paren_end + 1
        
    if not sub_lists: 
        return [template_string] # No parentheses found, return as-is
        
    final_list = []
    # Create all combinations from the sub-lists
    for combo in itertools.product(*sub_lists):
        combo_list = list(combo)
        # Reconstruct the string, respecting empty strings
        result_str = "".join(combo_list.pop(0).strip() if p is None else p for p in parts)
        final_list.append(result_str)
        
    return final_list

def _get_options_for_dim(parser, dim_str):
    """
    Resolves a single dimension string into its final list of options
    AND its total weight.
    Returns: (weighted_list, total_weight)
    """
    dim_str = dim_str.strip()
    
    # Case 1: Is it a template string, e.g., "(a|b) c" or "(|a)"
    if '(' in dim_str and ')' in dim_str:
        options = _i_expand_template(parser, dim_str)
    else:
        # Case 2: Is it a wildcard file?
        # _get_list_from_content returns the list from the file, or [dim_str] if not found
        options = parser._get_list_from_content(dim_str)
        
        # Case 3: Is it a simple list?
        # If it wasn't a wildcard file, options is just [dim_str]. Now split it.
        if len(options) == 1 and options[0] == dim_str:
            options = parser._split_toplevel_options(dim_str, delimiter='|')
            
    # Now that we have our final list of strings, get the weighted options
    return _get_weighted_options(parser, options)

def execute(parser, content, **kwargs):
    start_index = kwargs.get('start_index', 0)
    linked_var_id = parser.command_links.get(str(start_index))
    current_iterator = int(parser.control_vars_by_id.get(linked_var_id, parser.iterator))
    
    content = content.strip()
    
    # 1. Get all dimensions
    dims_str = []
    # --- FIX: Only split by top-level | if parentheses are present ---
    # This correctly treats "a|b|c" as 1D, but "(a|b)|c" as 2D.
    if '(' in content and ')' in content:
        dims_str = parser._split_toplevel_options(content)
    else:
        # No parentheses, so treat the entire string as a single dimension
        dims_str = [content]
    
    # 2. Resolve all dimensions into (weighted_list, total_weight) tuples
    #    e.g., [ "a:2|", "(|b) c" ] ->
    #    [
    #      ( [('a', 2), ('', 1)], 3 ),
    #      ( [(' c', 1), ('bc', 1)], 2 )
    #    ]
    dims = [_get_options_for_dim(parser, d) for d in dims_str]
    
    # 3. Get the total weight (length) of each dimension
    dim_lengths = [max(1, d[1]) for d in dims] # d[1] is total_weight
    
    # 4. Use the "odometer" logic to find the correct item for each dimension
    selected_items = []
    for i in range(len(dims)):
        # Calculate the product of all *faster* (subsequent) dimension lengths
        prod_faster_dims = 1
        for j in range(i + 1, len(dims)):
            prod_faster_dims *= dim_lengths[j]
            
        # Find the correct iterator "step" for the current dimension
        dim_iterator = current_iterator // prod_faster_dims
        index_step = dim_iterator % dim_lengths[i]
        
        # Get the item. Handle case where a dimension might be empty.
        weighted_list = dims[i][0] # d[0] is weighted_list
        if weighted_list:
            selected_item = _get_item_from_weighted_list(weighted_list, index_step)
            selected_items.append(selected_item.strip())
        else:
            selected_items.append("") # Append empty string if dim was empty
            
    # 5. Join all selected items with a comma
    return ", ".join(selected_items)


