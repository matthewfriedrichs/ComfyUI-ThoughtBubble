from .thought_bubble_node import ThoughtBubbleNode

# Expose an API endpoint to get the list of LoRAs
from aiohttp import web
import server
import folder_paths

@server.PromptServer.instance.routes.get("/loras")
async def get_loras(request):
    try:
        lora_names = folder_paths.get_filename_list("loras")
        return web.json_response(lora_names)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

NODE_CLASS_MAPPINGS = {
    "ThoughtBubbleNode": ThoughtBubbleNode
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ThoughtBubbleNode": "Thought Bubble"
}

WEB_DIRECTORY = "./js"

__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS']