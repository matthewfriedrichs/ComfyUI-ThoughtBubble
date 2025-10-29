import random
import re

def _parse_weight(weight_str):
    """
    Parses a weight string for random choice.
    Supports floats (0.5) and integers (2).
    """
    try:
        weight_str = weight_str.strip()
        weight = float(weight_str)
        if weight <= 0:
            return 1.0 # Default to 1.0 if weight is zero or negative
        return weight
    except ValueError:
        return 1.0 # Default to 1.0 if not a valid number

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

    choices = []
    weights = []
    has_weights = False

    for item in options:
        try:
            # Try to split by the last colon
            text, weight_str = item.rsplit(':', 1)
            weight = _parse_weight(weight_str)
            text = text.strip()
            # Check if the weight is different from the default
            if weight != 1.0:
                has_weights = True
        except ValueError:
            # No colon or invalid weight, treat as default
            text = item.strip()
            weight = 1.0
        
        # --- FIX: We now correctly append all items, including empty strings ---
        choices.append(text)
        weights.append(weight)

    if not choices:
        return ""
        
    # Use the appropriate random function
    try:
        if has_weights:
            # Use weighted random choice
            return rng_instance.choices(choices, weights=weights, k=1)[0].strip()
        else:
            # Use standard (uniform) random choice
            return rng_instance.choice(choices).strip()
    except IndexError:
        # This can happen if choices is empty, though we check for it.
        return ""

