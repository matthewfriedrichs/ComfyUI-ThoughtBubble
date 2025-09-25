def execute(parser, content, **kwargs):
    parser.areas_to_apply.append(content.strip().lower())
    return ""