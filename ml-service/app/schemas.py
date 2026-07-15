from pydantic import BaseModel, Field
from typing import List, Optional, Dict


class TaskInput(BaseModel):
    id: str
    description: str


class DeveloperInput(BaseModel):
    id: str
    name: str
    skillTags: List[str]


class AssignmentInput(BaseModel):
    developerId: str
    taskId: str
    accepted: bool


class RecommendRequest(BaseModel):
    task: TaskInput
    developers: List[DeveloperInput]
    assignments: List[AssignmentInput] = Field(default_factory=list)
    workloads: Dict[str, float] = Field(default_factory=dict)
    sprintCapacity: int = 40


class ScoreBreakdown(BaseModel):
    nlp: float
    cf: float
    capacity: float


class RecommendationItem(BaseModel):
    developerId: str
    name: str
    score: float
    breakdown: ScoreBreakdown
    skillTags: List[str] = Field(default_factory=list)
    cold_start: bool = False


class RecommendResponse(BaseModel):
    recommendations: List[RecommendationItem]
    cold_start: bool = False


class FeedbackRequest(BaseModel):
    taskId: str
    developerId: str
    action: str  # "accept" or "reject"


class FeedbackResponse(BaseModel):
    status: str
    retrained: bool
    newAccuracy: Optional[float] = None


class AccuracyResponse(BaseModel):
    precision: float
    recall: float
    totalFeedback: int


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool


# ── Retrain (live retraining from accumulated feedback) ───────────────────────
class RetrainDeveloper(BaseModel):
    id: str
    name: Optional[str] = ""
    skills: List[str] = Field(default_factory=list)
    skillTags: List[str] = Field(default_factory=list)


class RetrainTask(BaseModel):
    id: str
    description: Optional[str] = ""
    title: Optional[str] = ""


class RetrainAssignment(BaseModel):
    developer_id: str
    task_id: str
    accepted: bool = True


class RetrainRequest(BaseModel):
    developers: List[RetrainDeveloper] = Field(default_factory=list)
    tasks: List[RetrainTask] = Field(default_factory=list)
    assignments: List[RetrainAssignment] = Field(default_factory=list)