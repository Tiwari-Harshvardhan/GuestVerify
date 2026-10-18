import asyncio
import json
import sys
from pathlib import Path

import anyio
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.mcp.server import server


async def main() -> None:
    app = server.streamable_http_app()
    import uvicorn

    config = uvicorn.Config(app, host="127.0.0.1", port=8001, log_level="warning")
    server_instance = uvicorn.Server(config)

    async def start_server() -> None:
        await server_instance.serve()

    async with anyio.create_task_group() as tg:
        tg.start_soon(start_server)
        await anyio.sleep(1)
        try:
            async with streamablehttp_client("http://127.0.0.1:8001/mcp") as (read, write, _):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    tools = await session.list_tools()
                    names = [tool.name for tool in tools.tools]
                    print(json.dumps({"initialized": True, "tool_count": len(tools.tools), "tools": names}, indent=2))
                    result = await session.call_tool("get_integration_status", {})
                    payload = json.loads(result.content[0].text)
                    print(json.dumps({"tool_result": payload}, indent=2))
        finally:
            server_instance.should_exit = True
            await anyio.sleep(0.5)


if __name__ == "__main__":
    asyncio.run(main())
