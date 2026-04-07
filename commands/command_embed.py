# filename: thoughtbubble/commands/command_embed.py
import folder_paths
import os


def execute(parser, args, **kwargs):
    if not args:
        return ""
    content = args[0].execute(parser, context=kwargs.get("context", "")).strip()

    # Default values
    embedding_name = content
    weight_val = 1.0
    has_weight = False

    # Attempt to parse "name:weight"
    # We use rsplit(':', 1) to handle paths (e.g., "SDXL/embedding:0.8")
    if ":" in content:
        try:
            part_name, part_weight = content.rsplit(":", 1)
            # Attempt to convert weight to float
            weight_val = float(part_weight)
            # If successful, update name and flag
            embedding_name = part_name.strip()
            has_weight = True
        except ValueError:
            # If float conversion fails (e.g. "my:embed"), treat entire string as name
            embedding_name = content
            has_weight = False

    if not embedding_name:
        return ""

    # Check Cache
    cache_key = f"{embedding_name}:{weight_val}" if has_weight else embedding_name
    if hasattr(parser, "embedding_cache") and cache_key in parser.embedding_cache:
        return parser.embedding_cache[cache_key]

    # Initialize Cache if missing
    if not hasattr(parser, "embedding_cache"):
        parser.embedding_cache = {}

    # Initialize Embedding List if missing
    if not hasattr(parser, "_available_embeddings"):
        try:
            parser._available_embeddings = folder_paths.get_filename_list("embeddings")
        except Exception:
            parser._available_embeddings = []

    # Find the matching filename
    found_filename = None

    # 1. Try Exact Match (Case Insensitive)
    lower_target = embedding_name.lower()
    for f in parser._available_embeddings:
        if f.lower() == lower_target:
            found_filename = f
            break

    # 2. Try Partial Match (Starts With)
    if not found_filename:
        for f in parser._available_embeddings:
            if f.lower().startswith(lower_target):
                found_filename = f
                break

    # Construct the final string for ComfyUI
    if found_filename:
        # ComfyUI expects "embedding:filename_without_ext"
        base_name = os.path.splitext(found_filename)[0]
        result = f"embedding:{base_name}"

        # Only append weight if it was explicitly provided
        if has_weight:
            result = f"{result}:{weight_val}"

        parser.embedding_cache[cache_key] = result
        return result
    else:
        # Not found: return original content so ComfyUI can warn the user normally
        parser.embedding_cache[cache_key] = content
        return content
