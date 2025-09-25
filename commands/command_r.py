def execute(parser, content, **kwargs):
    parts = content.split('|')
    try:
        if len(parts) == 1:
            max_val = float(parts[0]) if '.' in parts[0] else int(parts[0])
            min_val = 0.0 if isinstance(max_val, float) else 0
        elif len(parts) == 2:
            min_val = float(parts[0]) if '.' in parts[0] else int(parts[0])
            max_val = float(parts[1]) if '.' in parts[1] else int(parts[1])
        
        if min_val > max_val: min_val, max_val = max_val, min_val
        
        # Check if either of the bounds is a float. If so, we'll generate a float.
        if isinstance(min_val, float) or isinstance(max_val, float):
            # Generate a random float between the two bounds.
            random_float = parser.rng.uniform(float(min_val), float(max_val))
            # Round the result to one decimal place and return it as a string.
            return str(round(random_float, 1))
        else:
            # If both bounds are integers, generate and return a random integer.
            return str(parser.rng.randint(min_val, max_val))
    except (ValueError, IndexError):
        return f"r({content})"
