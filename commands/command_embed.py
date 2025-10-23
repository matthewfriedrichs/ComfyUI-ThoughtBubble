# filename: thoughtbubble/commands/command_embed.py

import folder_paths
import os

def execute(parser, content, **kwargs):
    """
    Finds a textual embedding file and formats it for use in the prompt.
    Caches the list of available embeddings for performance.
    Handles 'filename' and 'filename:weight' syntax.
    """
    
    embedding_name = content.strip()
    weight_str = None

    # Handle 'filename:weight' syntax
    if ':' in embedding_name:
        try:
            name_part, weight_part = embedding_name.rsplit(':', 1)
            float(weight_part) # Check if it's a valid number
            embedding_name = name_part.strip()
            weight_str = weight_part.strip()
        except ValueError:
            # The part after the colon wasn't a number.
            # Assume the entire string is the filename.
            embedding_name = content.strip()

    if not embedding_name:
        return ""

    # Generate a cache key that includes the weight, if present
    cache_key = f"{embedding_name}:{weight_str}" if weight_str else embedding_name
    
    # Check the cache first
    if cache_key in parser.embedding_cache:
        return parser.embedding_cache[cache_key]

    try:
        # Get all available embeddings if not already cached in the parser instance
        if not hasattr(parser, '_available_embeddings'):
            parser._available_embeddings = folder_paths.get_filename_list("embeddings")

        # Find the matching file
        embedding_filename = next((f for f in parser._available_embeddings if f.startswith(embedding_name)), None)

        if embedding_filename:
            # Get the filename without extension
            base_name = os.path.splitext(embedding_filename)[0]
            
            # Format the string ComfyUI understands
            result = f"embedding:{base_name}"
            if weight_str:
                result = f"{result}:{weight_str}"
                
            # Cache the result for next time
            parser.embedding_cache[cache_key] = result
            return result
        else:
            print(f"Thought Bubble Warning: Could not find an embedding file for '{embedding_name}'")
            # Cache the failure to avoid repeated lookups
            original_text = f"{embedding_name}:{weight_str}" if weight_str else embedding_name
            parser.embedding_cache[cache_key] = original_text
            return original_text # Return original text if not found

    except Exception as e:
        print(f"Thought Bubble Error during embedding lookup: {e}")
        original_text = f"{embedding_name}:{weight_str}" if weight_str else embedding_name
        return original_text