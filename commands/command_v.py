# filename: thoughtbubble/commands/command_v.py

import re

NEG_TAG_START = "###NEG###"
NEG_TAG_END = "###/NEG###"


# --- UPDATED: Accepts context to pass into recursive parsing ---
def _fetch_content(parser, var_name, context=""):
    var_name = var_name.strip().lower()

    if var_name in parser.control_vars_by_name:
        return str(parser.control_vars_by_name[var_name])

    if var_name in parser.box_map:
        raw_box_content = parser.box_map[var_name]
        # PASS CONTEXT HERE so ?() inside variables can see previous text
        return parser.parse_fragment(raw_box_content, context=context)

    if var_name in parser.variables:
        return parser.variables[var_name]

    return ""


def execute(parser, args, **kwargs):
    if not args:
        return ""

    context = kwargs.get("context", "")

    # SET
    if len(args) == 2:
        var_name = args[0].execute(parser, context=context).strip().lower()
        var_value = args[1].execute(parser, context=context).strip()
        parser.variables[var_name] = var_value
        return ""

    # GET
    expression_str = args[0].execute(parser, context=context)
    var_tokens = re.findall(r"([+-]?)\s*([^\s+-]\S*)", expression_str)

    final_parts = []
    for prefix, var_name in var_tokens:
        # Pass the context!
        content = _fetch_content(parser, var_name, context=context).strip()
        if not content:
            continue

        is_negative = content.startswith(NEG_TAG_START) and content.endswith(
            NEG_TAG_END
        )
        core_content = content
        if is_negative:
            core_content = content[len(NEG_TAG_START) : -len(NEG_TAG_END)].strip()

        if prefix == "-":
            if is_negative:
                final_parts.append(core_content)
            else:
                final_parts.append(f"{NEG_TAG_START}{core_content}{NEG_TAG_END}")
        else:
            final_parts.append(content)

    return ", ".join(final_parts)
