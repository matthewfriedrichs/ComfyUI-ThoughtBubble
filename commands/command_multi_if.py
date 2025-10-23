# filename: thoughtbubble/commands/command_multi_if.py

import re

def _parse_weight(weight_str):
    """
    Parses a weight string.
    Converts '0.5' to 0.5 and '50' to 0.5.
    """
    try:
        weight_str = weight_str.strip()
        if '.' in weight_str:
            # Treat as a float (e.g., 0.5)
            return float(weight_str)
        else:
            # Treat as an integer and divide by 100 (e.g., 50 -> 0.5)
            return float(weight_str) / 100.0
    except ValueError:
        print(f"ThoughtBubble: Invalid weight format '{weight_str}'. Defaulting to 0.")
        return 0.0

def execute(parser, value, **kwargs):
    """
    Executes a multi-conditional statement based on weighted context.
    Finds the first true condition and returns its value.
    Syntax: ??(cond1|text1|cond2|text2|...|default_text)
    (cond is weighted context 'word:50, word2:0.5')
    """
    parts = parser._split_toplevel_options(value, delimiter='|')
    
    if not parts:
        return "" # No content
        
    if len(parts) == 1:
        return parts[0].strip() # Only a default value was provided

    if len(parts) % 2 == 0:
        # Malformed, missing a final default value
        print(f"ThoughtBubble: Invalid ??() syntax. Expected odd number of parts, got {len(parts)}. Content: {value}")
        return "" 
        
    context = kwargs.get('context', '').lower()

    # Iterate through condition/text pairs
    for i in range(0, len(parts) - 1, 2):
        condition_str = parts[i].strip()
        true_text = parts[i+1].strip()
        
        is_condition_met = False
        
        # Perform a weighted context check
        total_weight = 0.0
        
        # Split by comma for multiple conditions (e.g., "word1:0.5, word2:0.5")
        conditions = parser._split_toplevel_options(condition_str, delimiter=',')
        
        for cond in conditions:
            cond = cond.strip()
            if not cond:
                continue

            word = ""
            weight_str = "1.0" # Default weight is 1.0 (or 100)

            # Check for colon-separated weight. Use rsplit to handle colons in the word.
            if ':' in cond:
                try:
                    word, weight_str = cond.rsplit(':', 1)
                    word = word.strip()
                except ValueError:
                    word = cond.strip() # Malformed, treat whole string as word
            else:
                word = cond.strip() # No weight provided

            # Find the word in the context
            if re.search(r'\b' + re.escape(word.lower()) + r'\b', context):
                total_weight += _parse_weight(weight_str)
                    
        # Condition is met if the sum of found weights is 1.0 or more
        is_condition_met = total_weight >= 1.0
                
        if is_condition_met:
            return true_text # Found the first match, return it
            
    # If no conditions were met, return the last part (default)
    return parts[-1].strip()