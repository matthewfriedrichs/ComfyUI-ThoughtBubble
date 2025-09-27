# commands/command_embed.py

import folder_paths
import os

def execute(parser, content, **kwargs):
    """
    Finds a textual embedding file and formats it for use in the prompt.
    Caches the list of available embeddings for performance.
    """
    embedding_name = content.strip()
    if not embedding_name:
        return ""

    # Check the cache first
    if embedding_name in parser.embedding_cache:
        return parser.embedding_cache[embedding_name]

    try:
        # Get all available embeddings if not already cached in the parser instance
        if not hasattr(parser, '_available_embeddings'):
            parser._available_embeddings = folder_paths.get_filename_list("embeddings")

        # Find the matching file
        embedding_filename = next((f for f in parser._available_embeddings if f.startswith(embedding_name)), None)

        if embedding_filename:
            # Return the formatted string that ComfyUI's tokenizer understands
            result = f"embedding:{os.path.splitext(embedding_filename)[0]}"
            # Cache the result for next time
            parser.embedding_cache[embedding_name] = result
            return result
        else:
            print(f"Thought Bubble Warning: Could not find an embedding file for '{embedding_name}'")
            # Cache the failure to avoid repeated lookups for the same missing file
            parser.embedding_cache[embedding_name] = embedding_name
            return embedding_name # Return original text if not found

    except Exception as e:
        print(f"Thought Bubble Error during embedding lookup: {e}")
        return embedding_name
