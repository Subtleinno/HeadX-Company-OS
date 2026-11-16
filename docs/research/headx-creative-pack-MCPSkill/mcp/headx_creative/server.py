"""HeadX Company OS — Creative MCP server (FastMCP).
Run:  python server.py            (stdio)
Env:  HEADX_DATA=/path/to/data  BLENDER_BIN=/path/to/blender
"""
from fastmcp import FastMCP
import core

mcp = FastMCP("headx-creative", instructions=(
    "HeadX Company OS creative tools. Always call brand_get_rules and asset_search first. "
    "Produce work through job_submit / lottie_generate, verify with review_checklist, "
    "and use approval_request before expensive or public-facing steps."))

@mcp.tool
def brand_get_rules() -> dict:
    """Get brand rules: palette (hex), fonts, tone, forbidden items, video defaults. Call before any design work."""
    return core.brand_get_rules()

@mcp.tool
def brand_set_rules(rules: dict) -> dict:
    """Update brand rules (merge). Only use when the boss gives new brand information."""
    return core.brand_set_rules(rules)

@mcp.tool
def brand_check_colors(colors: list[str]) -> dict:
    """Check whether hex colors (e.g. '#2E6BE6') belong to the brand palette."""
    return core.brand_check_colors(colors)

@mcp.tool
def asset_search(query: str = "", type: str | None = None, tag: str | None = None, limit: int = 20) -> list[dict]:
    """Search the asset library. type: 3d_model|lottie|image|video|audio|font|pattern|template|document."""
    return core.asset_search(query, type, tag, limit)

@mcp.tool
def asset_save(type: str, name: str, path: str, tags: list[str] | None = None, meta: dict | None = None) -> dict:
    """Register a finished file in the asset library with tags and metadata (source job, params, license)."""
    return core.asset_save(type, name, path, tags, meta)

@mcp.tool
def asset_inspect_glb(path: str) -> dict:
    """Read mesh/material/texture/animation counts and size of a .glb file."""
    return core.asset_inspect_glb(path)

@mcp.tool
def template_list(type: str | None = None) -> list[dict]:
    """List templates with their parameter JSON-schema. type: lottie|blender|hyperframes."""
    return core.template_list(type)

@mcp.tool
def job_submit(type: str, template: str, params: dict, run: bool = True) -> dict:
    """Validate and run a production job. type=lottie (params per template schema) | hyperframes
    (params: project_dir, quality draft|standard|high, docker, check_only, name) | blender (template + params)."""
    return core.job_submit(type, template, params, run)

@mcp.tool
def job_status(job_id: str) -> dict:
    """Get a job's status and result (outputs, logs, registered assets)."""
    return core.job_status(job_id)

@mcp.tool
def lottie_generate(template: str, params: dict | None = None, name: str | None = None) -> dict:
    """Generate a safe Lottie JSON from a built-in template (icon_pulse, spinner); validated and saved to the asset library."""
    return core.lottie_generate(template, params, name)

@mcp.tool
def lottie_validate(json_or_path: str) -> dict:
    """Safety/quality gate for any Lottie: rejects expressions, scripts/URLs, oversize, bad fps. Use on ALL external Lottie."""
    return core.lottie_validate(json_or_path)

@mcp.tool
def review_checklist(kind: str = "general") -> list[str]:
    """Acceptance checklist. kind: hyperframes|blender|lottie|general. Verify each item before delivering."""
    return core.review_checklist(kind)

@mcp.tool
def approval_request(summary: str, payload: dict | None = None) -> dict:
    """Ask the boss to approve before an expensive/irreversible/public step (final render, publishing, spending)."""
    return core.approval_request(summary, payload)

@mcp.tool
def approval_status(approval_id: str) -> dict | None:
    """Check whether an approval request is pending/approved/rejected."""
    return core.approval_status(approval_id)

@mcp.tool
def lesson_add(area: str, lesson: str) -> dict:
    """Record a reusable lesson (what failed/worked) so future runs improve. area: hyperframes|blender|lottie|brand|general."""
    return core.lesson_add(area, lesson)

@mcp.tool
def lesson_list(area: str | None = None) -> list[dict]:
    """Read past lessons. Call at the start of a task."""
    return core.lesson_list(area)

@mcp.tool
def tool_doctor() -> dict:
    """Check which production tools exist on this machine (node, ffmpeg, blender, docker)."""
    return core.tool_doctor()

if __name__ == "__main__":
    mcp.run()
