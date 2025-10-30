import random

def _parse_weight(weight_str):
    """
    Parses a weight string.
    Converts '50' to 50, '1.2' to 1.2.
    Returns a positive float or int.
    """
    try:
        weight_val = float(weight_str.strip())
        if weight_val > 0:
            return weight_val
    except ValueError:
        pass
    return 1.0 # Default weight if parsing fails or weight is <= 0

def _get_weighted_options(parser, options_list):
    """
    Parses a list of option strings into a list of (text, weight) tuples.
    Handles empty strings correctly.
    """
    weighted_list = []

    for item in options_list:
        text = item
        weight = 1.0
        
        if ':' in item:
            try:
                parts = item.rsplit(':', 1)
                maybe_weight = float(parts[1].strip())
                if maybe_weight > 0:
                    text = parts[0]
                    weight = maybe_weight
            except (ValueError, IndexError):
                # Not a valid weight, treat the whole string as text
                text = item
                weight = 1.0
        
        # We must include empty strings.
        # The w() command should strip, as "red:1" should result in "red"
        #
        # This is different from i() command, which should *preserve* whitespace.
        # w( red | blue ) should be ["red", "blue"]
        # i( red | blue ) should be [" red ", " blue "]
        
        text = text.strip() 
        weighted_list.append((text, weight))
    
    return weighted_list

def execute(parser, content, **kwargs):
    start_index = kwargs.get('start_index', 0)
    linked_var_id = parser.command_links.get(str(start_index))
    
    rng_instance = parser.rng
    if linked_var_id and linked_var_id in parser.control_vars_by_id:
        rng_instance = random.Random()
        rng_instance.seed(parser.control_vars_by_id[linked_var_id])
        
    options = parser._get_list_from_content(content)
    
    if not options:
        return ""

    weighted_options = _get_weighted_options(parser, options)
    
    choices = [text for text, weight in weighted_options]
    weights = [weight for text, weight in weighted_options]

    if not choices:
        return ""

    # Use the seeded RNG to make a weighted choice
    selected_text = rng_instance.choices(choices, weights=weights, k=1)[0]
    
    # --- MODIFIED: Recursive wildcard/box logic ---
    selected_text_lower = selected_text.lower()
    
    # Check if the selected item is *itself* a wildcard file
    if selected_text_lower in parser.wildcards:
        # If so, pick a random item from that file
        recursive_options = parser.wildcards[selected_text_lower]
        if recursive_options:
            # Note: This recursive step does not currently support weights
            # from inside the file. It's a simple random choice.
            return rng_instance.choice(recursive_options).strip()
            
    # --- NEW: Check if the selected item is a box title ---
    elif selected_text_lower in parser.box_map:
        # If so, get content from the box, treat it as a list, and pick a random item
        box_content = parser.box_map[selected_text_lower]
        recursive_options = [line.strip() for line in box_content.split('\n') if line.strip()]
        if recursive_options:
            return rng_instance.choice(recursive_options)

    return selected_text