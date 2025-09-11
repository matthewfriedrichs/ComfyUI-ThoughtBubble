from .thought_bubble_node import ThoughtBubbleNode
from aiohttp import web
import server
import folder_paths
import os
import json

# --- Helper Functions for File Operations ---
textfiles_directory = os.path.join(os.path.dirname(folder_paths.get_input_directory()), 'user', 'textfiles')
MAX_FILE_SIZE_MB = 5
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

def ensure_user_directories():
    """Ensures the user directories for textfiles exist."""
    if not os.path.exists(textfiles_directory):
        os.makedirs(textfiles_directory)

def is_path_safe(filepath):
    """Checks if the resolved file path is securely within the base directory."""
    try:
        abs_basedir = os.path.abspath(textfiles_directory)
        abs_filepath = os.path.abspath(filepath)
        return os.path.commonpath([abs_filepath, abs_basedir]) == abs_basedir
    except ValueError:
        return False

# --- API Endpoints ---
@server.PromptServer.instance.routes.get("/loras")
async def get_loras(request):
    try:
        lora_names = folder_paths.get_filename_list("loras")
        return web.json_response(lora_names)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

@server.PromptServer.instance.routes.get("/thoughtbubble/textfiles")
async def get_text_files(request):
    """Returns a list of .txt files from the user/textfiles directory."""
    ensure_user_directories()
    files = [f for f in os.listdir(textfiles_directory) if f.endswith('.txt')]
    return web.json_response(files)

@server.PromptServer.instance.routes.post("/thoughtbubble/save")
async def save_text_file(request):
    """Saves text content to a file in the user/textfiles directory with enhanced security."""
    ensure_user_directories()
    try:
        data = await request.json()
        filename = data.get('filename')
        content = data.get('content')
        
        if not filename or not isinstance(filename, str):
            return web.json_response({"error": "Filename is required and must be a string."}, status=400)
        
        if len(content.encode('utf-8')) > MAX_FILE_SIZE_BYTES:
            return web.json_response({"error": f"Content exceeds the maximum file size of {MAX_FILE_SIZE_MB}MB."}, status=400)

        # Sanitize filename to prevent path traversal
        secure_filename = os.path.basename(filename)

        if not secure_filename or not secure_filename.endswith('.txt'):
            return web.json_response({"error": "Invalid filename. It must not be empty and must end with .txt"}, status=400)
        
        filepath = os.path.join(textfiles_directory, secure_filename)

        # Final security check to ensure the path is within the allowed directory
        if not is_path_safe(filepath):
            return web.json_response({"error": "Invalid file path detected."}, status=403)

        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        return web.json_response({"success": True, "message": f"Saved to {secure_filename}"})
    except json.JSONDecodeError:
        return web.json_response({"error": "Invalid JSON in request body."}, status=400)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

@server.PromptServer.instance.routes.get("/thoughtbubble/load")
async def load_text_file(request):
    """Loads text content from a file in the user/textfiles directory with enhanced security."""
    ensure_user_directories()
    filename = request.query.get('filename')
    
    if not filename:
        return web.json_response({"error": "Filename is required"}, status=400)
    
    # Sanitize filename to prevent path traversal
    secure_filename = os.path.basename(filename)

    filepath = os.path.join(textfiles_directory, secure_filename)

    if not os.path.exists(filepath):
        return web.json_response({"error": "File not found"}, status=404)
        
    # Final security check to ensure the path is within the allowed directory
    if not is_path_safe(filepath):
        return web.json_response({"error": "Access to the requested file path is forbidden."}, status=403)

    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        return web.json_response({"content": content})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

# --- Node Mappings ---
NODE_CLASS_MAPPINGS = {
    "ThoughtBubbleNode": ThoughtBubbleNode
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ThoughtBubbleNode": "Thought Bubble"
}

WEB_DIRECTORY = "./js"

__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS']
