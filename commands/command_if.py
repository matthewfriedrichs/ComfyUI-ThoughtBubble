# filename: thoughtbubble/commands/command_if.py

from .utils import check_condition


def execute(parser, args, **kwargs):
    """
    Syntax: ?(condition|true_text|false_text)
    """
    if len(args) < 2:
        return ""

    # 1. Resolve condition (e.g. "fall")
    # Pass context so wildcards/vars inside the condition resolve correctly
    current_context = kwargs.get("context", "")
    condition_str = args[0].execute(parser, context=current_context).strip()

    # 2. Check Truth using shared logic
    is_met = check_condition(parser, condition_str, current_context)

    # 3. Execute the chosen branch
    if is_met:
        return args[1].execute(parser, context=current_context)
    elif len(args) > 2:
        return args[2].execute(parser, context=current_context)

    return ""
