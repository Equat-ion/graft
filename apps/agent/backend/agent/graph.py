"""LangGraph state machine for one Graft upgrade episode.

Flow:
    START → agent_node
        agent_node → tool_node           (when LLM emits a tool call other than submit)
        agent_node → reward_node         (when LLM calls submit())
        agent_node → violation_node      (budget exhausted or violation flagged)
        tool_node  → agent_node          (loop)
        reward_node → END
        violation_node → END
"""

from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timezone
from typing import Annotated, Any, TypedDict

from langchain_core.messages import (
    AIMessage,
    BaseMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages

from backend.agent.prompts import GRAFT_SYSTEM_PROMPT
from backend.agent.reward import compute_reward
from backend.agent.session import current_session
from backend.agent.tools import ALL_TOOLS, serialise_args, tools_by_name
from backend.config import get_settings

logger = logging.getLogger(__name__)


class GraftState(TypedDict, total=False):
    run_id: str
    repo_path: str
    dep_name: str
    from_version: str
    to_version: str
    baseline_passed: int
    baseline_failed: int
    messages: Annotated[list[BaseMessage], add_messages]
    steps_taken: int
    max_steps: int
    submitted: bool
    final_reward: float | None
    final_passed: int | None
    final_failed: int | None
    violation: str | None


def make_llm() -> ChatOpenAI:
    """Build a ChatOpenAI client from Settings (any OpenAI-compatible endpoint)."""
    s = get_settings()
    return ChatOpenAI(
        base_url=s.llm_base_url,
        api_key=s.llm_api_key or "ignored",
        model=s.llm_model,
        temperature=s.llm_temperature,
        max_tokens=s.llm_max_tokens,
        timeout=120,
    )


def _initial_messages(state: GraftState) -> list[BaseMessage]:
    user = (
        f"Upgrade {state['dep_name']} from {state['from_version']} to {state['to_version']}.\n"
        f"Test suite baseline: {state.get('baseline_passed', 0)} passing, "
        f"{state.get('baseline_failed', 0)} failing."
    )
    return [SystemMessage(content=GRAFT_SYSTEM_PROMPT), HumanMessage(content=user)]


def build_graph():
    """Compile and return a LangGraph runnable for one episode."""

    llm = make_llm().bind_tools(ALL_TOOLS)
    tools = tools_by_name()

    def agent_node(state: GraftState) -> dict[str, Any]:
        messages = state.get("messages") or _initial_messages(state)
        try:
            response = llm.invoke(messages)
        except Exception as e:
            logger.exception("LLM invocation failed")
            session = current_session()
            session.sandbox.flag_violation(f"llm_error: {e}")
            return {"messages": [AIMessage(content=f"LLM error: {e}")], "violation": str(e)}

        out: dict[str, Any] = {"messages": [response]}
        if getattr(response, "tool_calls", None):
            for tc in response.tool_calls:
                if tc.get("name") == "submit":
                    out["submitted"] = True
                    break
        return out

    def tool_node(state: GraftState) -> dict[str, Any]:
        last = state["messages"][-1]
        new_messages: list[BaseMessage] = []
        steps_taken = state.get("steps_taken", 0)
        session = current_session()

        for tc in getattr(last, "tool_calls", []) or []:
            name = tc.get("name", "")
            raw_args = tc.get("args", {})
            args = serialise_args(raw_args)
            tc_id = tc.get("id", f"call_{steps_taken}")

            tool = tools.get(name)
            t0 = time.perf_counter()
            if tool is None:
                result_text = f"ERROR: unknown tool {name}"
            else:
                try:
                    result = tool.invoke(args)
                except Exception as e:
                    result = f"ERROR: tool {name} raised: {e}"
                result_text = result if isinstance(result, str) else json.dumps(result, default=str)
            duration_ms = int((time.perf_counter() - t0) * 1000)

            new_messages.append(ToolMessage(content=result_text, tool_call_id=tc_id))
            steps_taken += 1

            record = {
                "step_no": steps_taken,
                "tool": name,
                "args": args,
                "result": result_text[:4000],
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "duration_ms": duration_ms,
            }
            session.step_log.append(record)
            if callable(session.on_step):
                try:
                    session.on_step(record)
                except Exception:
                    logger.exception("on_step callback failed")

        return {"messages": new_messages, "steps_taken": steps_taken}

    def reward_node(state: GraftState) -> dict[str, Any]:
        session = current_session()
        result, violation = session.sandbox.run_final_evaluation()
        baseline = session.sandbox.baseline()
        reward = compute_reward(
            baseline_passed=baseline.passed,
            baseline_failed=baseline.failed,
            final_passed=result.passed,
            final_failed=result.failed,
            steps_taken=state.get("steps_taken", 0),
            violation=violation,
        )
        return {
            "final_reward": reward,
            "final_passed": result.passed,
            "final_failed": result.failed,
            "violation": violation,
        }

    def violation_node(state: GraftState) -> dict[str, Any]:
        session = current_session()
        violation = session.sandbox.violation or state.get("violation") or "budget_exhausted"
        return {"final_reward": -1.0, "violation": violation}

    def route_from_agent(state: GraftState) -> str:
        session = current_session()
        if session.sandbox.violation:
            return "violation"
        if state.get("submitted"):
            return "reward"
        if state.get("steps_taken", 0) >= state.get("max_steps", 50):
            return "violation"
        last = state["messages"][-1] if state.get("messages") else None
        if last is not None and getattr(last, "tool_calls", None):
            return "tools"
        return "violation"

    builder: StateGraph = StateGraph(GraftState)
    builder.add_node("agent", agent_node)
    builder.add_node("tools", tool_node)
    builder.add_node("reward", reward_node)
    builder.add_node("violation", violation_node)

    builder.add_edge(START, "agent")
    builder.add_conditional_edges(
        "agent",
        route_from_agent,
        {"tools": "tools", "reward": "reward", "violation": "violation"},
    )
    builder.add_edge("tools", "agent")
    builder.add_edge("reward", END)
    builder.add_edge("violation", END)

    return builder.compile(checkpointer=MemorySaver())
