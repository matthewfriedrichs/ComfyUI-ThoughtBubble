# filename: thoughtbubble/commands/command_t.py


def execute(parser, args, **kwargs):
    """
    Schedules a prompt.
    Syntax: t(start|text|end) OR t(start|text) OR t(text|end)
    """
    if not args:
        return ""

    context = kwargs.get("context", "")

    # Execute args to get the parts (start, text, end)
    parts = [arg.execute(parser, context=context).strip() for arg in args]

    prompt_text = ""
    start_at = 0.0
    end_at = 1.0
    valid = False

    try:
        if len(parts) == 3:
            # t(start|text|end)
            start_at = float(parts[0])
            prompt_text = parts[1]
            end_at = float(parts[2])
            valid = True

        elif len(parts) == 2:
            # Ambiguous 2-part syntax
            try:
                # Try t(start|text)
                start_at = float(parts[0])
                prompt_text = parts[1]
                end_at = 1.0
                valid = True
            except ValueError:
                # Must be t(text|end)
                start_at = 0.0
                prompt_text = parts[0]
                end_at = float(parts[1])
                valid = True

        if valid and prompt_text:
            parser.scheduled_prompts.append(
                {
                    "prompt": prompt_text,
                    "start_at": max(0.0, min(1.0, start_at)),
                    "end_at": max(0.0, min(1.0, end_at)),
                }
            )

    except (ValueError, IndexError):
        pass

    # Returns nothing to the main prompt string
    return ""
