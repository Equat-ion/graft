# Agent Tool Development Guide

This guide describes how agent tools are defined, executed, and logged.

## Overview

Tools are StructuredTool objects created in apps/agent/backend/agent/tools.py and bound to the LLM in the state machine. The tool list is:

- read_file
- edit_file
- grep_repo
- ast_query
- read_changelog
- run_tests
- submit

When the LLM emits a tool call, the state machine executes the tool and records the result as a ToolMessage plus a step log entry.

## Execution flow

1. The LLM emits a tool call in agent_node.
2. tool_node finds the tool by name, serializes args, and invokes the tool.
3. The tool result is written to a ToolMessage and appended to the message list.
4. A step record is appended to AgentRun.steps via the session on_step callback.

## Safety constraints

- Paths are resolved relative to the sandbox workspace via _safe_resolve.
- edit_file rejects any file under tests/, test/, spec/, __tests__, or known test config names.
- edit_file requires old_str to occur exactly once.
- grep_repo and ast_query are capped at 200 matches to limit output size.

Violations are flagged in the sandbox, and any violation forces the reward to -1.0.

## Adding a new tool

1. Define a Pydantic args schema.
2. Implement the tool function. Use current_session() to access the workspace or sandbox.
3. Wrap it with StructuredTool.from_function.
4. Add it to ALL_TOOLS.
5. Update the system prompt (GRAFT_SYSTEM_PROMPT) so the LLM knows when to use it.
6. If the tool changes the run workflow, update docs and the frontend step display if needed.

## Output guidelines

- Return a short string or a JSON serializable dict.
- Keep result text concise; step logs truncate long results to 4000 chars.
- Surface errors in the tool result rather than raising whenever possible.

## Tool output schema

Every tool result is converted to a string. If you return a dict, it is json encoded in the tool node before logging. Use stable keys so the frontend StepTrace view remains readable.
