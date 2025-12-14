# filename: thoughtbubble/commands/command_w.py

from .utils import parse_weighted_option, fetch_list_source


def execute(parser, args, **kwargs):
    if not args:
        return ""
    context = kwargs.get("context", "")

    # 1. Resolve arguments & Parse Weights
    options = []
    weights = []

    for arg in args:
        resolved_text = arg.execute(parser, context=context)
        content, w = parse_weighted_option(resolved_text)

        if content:
            options.append(content)
            weights.append(w)

    if not options:
        return ""
    if sum(weights) <= 0:
        return ""

    # 2. Pick an option
    choice = parser.rng.choices(options, weights=weights, k=1)[0]

    # 3. Check for Expansion (Source List)
    # Using the shared utility to check Wildcards, Boxes, Vars, etc.
    cleaned = choice.strip()
    expansion_lines = fetch_list_source(parser, cleaned)

    if expansion_lines:
        # Parse weights for the lines inside the source
        sub_options = []
        sub_weights = []
        for line in expansion_lines:
            c, w = parse_weighted_option(line)
            if c:
                sub_options.append(c)
                sub_weights.append(w)

        if sub_options and sum(sub_weights) > 0:
            return parser.rng.choices(sub_options, weights=sub_weights, k=1)[0]
        return ""

    return choice
