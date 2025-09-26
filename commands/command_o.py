import os

def execute(parser, content, **kwargs):
    """
    Loads the content of an external text file, using a cache to avoid repeated reads.
    The file is expected to be in the 'user/textfiles' directory.
    """
    filename = content.strip()
    if not filename:
        return ""

    if not filename.endswith('.txt'):
        filename += '.txt'
    
    filepath = os.path.join(parser.textfiles_directory, os.path.basename(filename))

    # --- NEW: Caching Logic ---
    if filepath in parser.textfile_cache:
        return parser.textfile_cache[filepath] # Cache Hit

    # Cache Miss
    try:
        if os.path.exists(filepath):
            with open(filepath, 'r', encoding='utf-8') as f:
                file_content = f.read()
                parser.textfile_cache[filepath] = file_content # Store in cache
                return file_content
        else:
            print(f"Thought Bubble Warning: o() command could not find file '{filename}'")
            return "" 
    except Exception as e:
        print(f"Thought Bubble Error: o() command failed to read file '{filename}': {e}")
        return ""
