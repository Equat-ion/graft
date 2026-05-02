import uuid
from datetime import datetime, timezone

from backend.db.schemas import ProjectOut


def test_project_out_includes_github_fields() -> None:
    payload = {
        "id": uuid.uuid4(),
        "name": "proj",
        "repo_path": "/tmp/repo",
        "language": "python",
        "created_at": datetime.now(timezone.utc),
        "dependencies": [],
        "github_connected": True,
        "github_username": "octocat",
        "github_repo_full_name": "octocat/hello",
    }
    out = ProjectOut.model_validate(payload)
    assert out.github_connected is True
    assert out.github_username == "octocat"
    assert out.github_repo_full_name == "octocat/hello"
