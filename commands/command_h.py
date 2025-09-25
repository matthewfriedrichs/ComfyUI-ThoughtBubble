def execute(parser, content, **kwargs):
    """
    Wraps the content in special markers. The content remains visible to
    other commands during parsing, but the markers and content are stripped
    out at the very end by the main parser's finalization step.
    """
    # Add spaces to ensure the tag doesn't merge with adjacent words.
    return f" ###HIDDEN_START###{content}###HIDDEN_END### "
