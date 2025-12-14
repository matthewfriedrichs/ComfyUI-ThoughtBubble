# filename: thoughtbubble/commands/command_multi_if.py

from .utils import check_condition


def execute(parser, args, **kwargs):
    """
    Syntax: ??(cond1|val1|cond2|val2|default)
    """
    if not args:
        return ""

    current_context = kwargs.get("context", "")

    # Single arg = Default return (Pass-through)
    if len(args) == 1:
        return args[0].execute(parser, context=current_context)

    # Iterate pairs
    for i in range(0, len(args) - 1, 2):
        condition_node = args[i]
        result_node = args[i + 1]

        cond_str = condition_node.execute(parser, context=current_context).strip()

        if check_condition(parser, cond_str, current_context):
            return result_node.execute(parser, context=current_context)

    # Default (if odd number of args)
    if len(args) % 2 != 0:
        return args[-1].execute(parser, context=current_context)

    return ""
