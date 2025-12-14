# filename: thoughtbubble/commands/command_i.py

import itertools
from .utils import parse_weighted_option, fetch_list_source


def _split_by_pipe(text):
    options = []
    balance = 0
    current_buffer = []
    i = 0
    while i < len(text):
        char = text[i]
        if char == "\\" and i + 1 < len(text):
            current_buffer.append(char)
            current_buffer.append(text[i + 1])
            i += 2
            continue
        if char == "(":
            balance += 1
        elif char == ")":
            balance -= 1

        if char == "|" and balance == 0:
            options.append("".join(current_buffer))
            current_buffer = []
        else:
            current_buffer.append(char)
        i += 1
    options.append("".join(current_buffer))
    return options


def _expand_options(text):
    if not text:
        return [""]
    segments = []
    current_buffer = []
    i = 0
    balance = 0

    while i < len(text):
        char = text[i]
        if char == "\\" and i + 1 < len(text):
            current_buffer.append(char)
            current_buffer.append(text[i + 1])
            i += 2
            continue
        if char == "(":
            if balance == 0:
                if current_buffer:
                    segments.append(["".join(current_buffer)])
                    current_buffer = []
            else:
                current_buffer.append(char)
            balance += 1
        elif char == ")":
            balance -= 1
            if balance == 0:
                group_content = "".join(current_buffer)
                current_buffer = []
                options = _split_by_pipe(group_content)
                expanded_options = []
                for opt in options:
                    expanded_options.extend(_expand_options(opt))
                segments.append(expanded_options)
            else:
                current_buffer.append(char)
        else:
            current_buffer.append(char)
        i += 1
    if current_buffer:
        segments.append(["".join(current_buffer)])

    results = []
    for combo in itertools.product(*segments):
        results.append("".join(combo))
    return results


def execute(parser, args, **kwargs):
    if not args:
        return ""
    context = kwargs.get("context", "")

    # 1. Execute all args
    resolved_args = []
    for arg in args:
        content = arg.execute(parser, context=context)
        resolved_args.append(content)

    # 2. Determine Mode
    is_dimensional_mode = False
    if len(resolved_args) > 1:
        all_wrapped = True
        for ra in resolved_args:
            stripped = ra.strip()
            if not (stripped.startswith("(") and stripped.endswith(")")):
                all_wrapped = False
                break
        if all_wrapped:
            is_dimensional_mode = True

    # 3. Process Arguments
    dimensions = []
    for content in resolved_args:
        expanded_list = _expand_options(content)
        dim_options = []

        for opt in expanded_list:
            text_part, weight_float = parse_weighted_option(opt)
            weight = int(weight_float)  # Iterator needs int count

            clean_opt = text_part.strip()

            # Helper to preserve whitespace surrounding the key
            prefix = ""
            suffix = ""
            if clean_opt and clean_opt in text_part:
                idx = text_part.find(clean_opt)
                prefix = text_part[:idx]
                suffix = text_part[idx + len(clean_opt) :]

            items_to_add = []

            # Unified Source Check (Wildcards, Boxes, Vars)
            source_lines = fetch_list_source(parser, clean_opt)

            if source_lines is not None:
                # Process lines for weights too
                for line in source_lines:
                    l_text, l_w = parse_weighted_option(line)
                    l_count = int(l_w)
                    if l_count > 0:
                        items_to_add.extend(
                            [f"{prefix}{l_text.strip()}{suffix}"] * l_count
                        )
            else:
                # Literal Text
                items_to_add = [text_part]

            # Apply the outer weight (repetition)
            if weight > 0 and items_to_add:
                dim_options.extend(items_to_add * weight)

        dimensions.append(dim_options)

    if not is_dimensional_mode:
        # MODE: OPTIONS (OR)
        all_options = []
        for dim in dimensions:
            all_options.extend(dim)
        if not all_options:
            return ""
        return all_options[parser.iterator % len(all_options)]

    else:
        # MODE: DIMENSIONS (AND)
        total_permutations = 1
        for dim in dimensions:
            if not dim:
                continue
            total_permutations *= len(dim)

        if total_permutations == 0:
            return ""

        current_step = parser.iterator % total_permutations
        indices = []
        divisor = 1

        for dim in reversed(dimensions):
            count = len(dim)
            if count == 0:
                indices.insert(0, 0)
                continue
            idx = (current_step // divisor) % count
            indices.insert(0, idx)
            divisor *= count

        results = []
        for dim, idx in zip(dimensions, indices):
            if dim:
                results.append(dim[idx])

        return "".join(results)
