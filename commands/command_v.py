# filename: thoughtbubble/commands/command_v.py

import re

NEG_TAG_START = "###NEG###"
NEG_TAG_END = "###/NEG###"


def _fetch_content(parser, var_name, context="", visited=None):
    if visited is None:
        visited = set()

    var_name = var_name.strip().lower()

    # --- INFINITE RECURSION PROTECTION ---
    if var_name in visited:
        # We are trying to load a box we are already currently loading! Return a space.
        return " "

    # Mark this variable as currently being visited
    new_visited = visited.copy()
    new_visited.add(var_name)

    if var_name in parser.control_vars_by_name:
        return str(parser.control_vars_by_name[var_name])

    if var_name in parser.box_map:
        raw_box_content = parser.box_map[var_name]
        return parser.parse_fragment(
            raw_box_content, context=context, visited=new_visited
        )

    if var_name in parser.variables:
        return parser.variables[var_name]

    return ""


def execute(parser, args, **kwargs):
    if not args:
        return ""

    context = kwargs.get("context", "")
    visited = kwargs.get("visited", set())

    # SET
    if len(args) == 2:
        var_name = (
            args[0].execute(parser, context=context, visited=visited).strip().lower()
        )
        var_value = args[1].execute(parser, context=context, visited=visited).strip()
        parser.variables[var_name] = var_value
        return ""

    # GET
    expression_str = args[0].execute(parser, context=context, visited=visited)
    var_tokens = re.findall(r"([+-]?)\s*([^\s+-]\S*)", expression_str)

    final_parts = []
    for prefix, var_name in var_tokens:
        content = _fetch_content(
            parser, var_name, context=context, visited=visited
        ).strip()

        # If the content was completely empty (or became empty after strip)
        if not content:
            # We specifically want to return " " for self-references
            if var_name.strip().lower() in visited:
                final_parts.append(" ")
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

    # Filter out empty strings but keep our deliberate " " space blocks
    clean_parts = [p for p in final_parts if p != ""]
    return ", ".join(clean_parts).replace(" ,", ",")
