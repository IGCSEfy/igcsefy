#!/usr/bin/env python3
import json
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Optional


REPO_ROOT = Path(__file__).resolve().parents[1]
SWIFT_HELPER = REPO_ROOT / "tools" / "extract_pdf_text.swift"
SWIFT_CACHE = Path("/tmp/swift-module-cache")
MARKER_ONLY_LINES = {"•", "–", "-", "—"}
GENERIC_SKIP_LINES = {
    "Topic",
    "Guidance",
    "Notes and guidance",
    "Candidates should be able to:",
    "Notes and examples",
    "Content",
    "Examples",
    "continued",
}
SECTION_VERB_PREFIXES = (
    "declare ",
    "understand ",
    "calculate ",
    "read ",
    "write ",
    "define ",
    "describe ",
    "explain ",
    "know ",
    "identify ",
    "evaluate ",
    "investigate ",
    "demonstrate ",
    "analyse ",
    "analyze ",
    "state ",
    "outline ",
    "discuss ",
    "compare ",
    "give ",
    "use ",
    "open ",
    "prepare ",
    "perform ",
    "convert ",
    "communicate ",
    "produce ",
    "respond ",
    "engage ",
    "show ",
    "deduce ",
    "select ",
    "listen ",
    "apply ",
    "suggest ",
    "recognise ",
    "recognize ",
    "process ",
    "post ",
    "record ",
    "distinguish ",
    "update ",
    "correct ",
    "comment ",
    "name ",
    "classify ",
    "complete ",
)
SECTION_VERB_WORDS = {prefix.strip() for prefix in SECTION_VERB_PREFIXES}
ESL_HEADING_VERBS = {
    "communicate",
    "deduce",
    "engage",
    "identify",
    "listen",
    "produce",
    "respond",
    "select",
    "show",
    "understand",
}
SCIENCE_POINT_VERBS = SECTION_VERB_WORDS | {
    "construct",
    "determine",
    "draw",
    "interpret",
    "plot",
    "recall",
    "sketch",
}


@dataclass
class SubjectConfig:
    slug: str
    code: str
    title: str
    pdf: str
    kind: str
    ranges: object = None


CONFIGS: list[SubjectConfig] = [
    SubjectConfig(
        slug="mathematics-0580",
        code="0580",
        title="Cambridge IGCSE Mathematics (0580) — For examination in 2025–2027",
        pdf="/Users/ebrahimbintariq/Downloads/662466-2025-2027-syllabus (4).pdf",
        kind="math",
        ranges={"core": (11, 30), "extended": (31, 55)},
    ),
    SubjectConfig(
        slug="biology-0610",
        code="0610",
        title="Cambridge IGCSE Biology (0610) — For examination in 2026–2028",
        pdf="/Users/ebrahimbintariq/Downloads/697203-2026-2028-syllabus (1).pdf",
        kind="science",
        ranges=(11, 47),
    ),
    SubjectConfig(
        slug="chemistry-0620",
        code="0620",
        title="Cambridge IGCSE Chemistry (0620) — For examination in 2026–2028",
        pdf="/Users/ebrahimbintariq/Downloads/697205-2026-2028-syllabus (1).pdf",
        kind="science",
        ranges=(11, 38),
    ),
    SubjectConfig(
        slug="physics-0625",
        code="0625",
        title="Cambridge IGCSE Physics (0625) — For examination in 2026–2028",
        pdf="/Users/ebrahimbintariq/Downloads/697209-2026-2028-syllabus (4).pdf",
        kind="science",
        ranges=(11, 40),
    ),
    SubjectConfig(
        slug="business-studies-0450",
        code="0450",
        title="Cambridge IGCSE Business Studies (0450) — For examination in 2026",
        pdf="/Users/ebrahimbintariq/Downloads/697146-2026-syllabus (2).pdf",
        kind="generic_depth2",
        ranges=(11, 23),
    ),
    SubjectConfig(
        slug="economics-0455",
        code="0455",
        title="Cambridge IGCSE Economics (0455) — For examination in 2026",
        pdf="/Users/ebrahimbintariq/Downloads/697154-2026-syllabus (1).pdf",
        kind="economics",
        ranges=(11, 23),
    ),
    SubjectConfig(
        slug="accounting-0452",
        code="0452",
        title="Cambridge IGCSE Accounting (0452) — For examination in 2026",
        pdf="/Users/ebrahimbintariq/Downloads/697149-2026-syllabus (2).pdf",
        kind="generic_depth2",
        ranges=(10, 17),
    ),
    SubjectConfig(
        slug="sociology-0495",
        code="0495",
        title="Cambridge IGCSE Sociology (0495) — For examination in 2025–2027",
        pdf="/Users/ebrahimbintariq/Downloads/662464-2025-2027-syllabus (1).pdf",
        kind="generic_depth2",
        ranges=(10, 29),
    ),
    SubjectConfig(
        slug="psychology-0266",
        code="0266",
        title="Cambridge IGCSE Psychology (0266) — For examination in 2027–2029",
        pdf="/Users/ebrahimbintariq/Downloads/718092-2027-2029-syllabus (1).pdf",
        kind="generic_depth2",
        ranges=(10, 36),
    ),
    SubjectConfig(
        slug="computer-science-0478",
        code="0478",
        title="Cambridge IGCSE Computer Science (0478) — For examination in 2026–2028",
        pdf="/Users/ebrahimbintariq/Downloads/697167-2026-2028-syllabus (1).pdf",
        kind="generic_depth2",
        ranges=(10, 30),
    ),
    SubjectConfig(
        slug="english-first-language-0500",
        code="0500",
        title="Cambridge IGCSE First Language English (0500) — For examination in 2024–2026",
        pdf="/Users/ebrahimbintariq/Downloads/635230-2024-2026-syllabus (1).pdf",
        kind="fle",
        ranges=(10, 11),
    ),
    SubjectConfig(
        slug="english-as-a-second-language-0510",
        code="0510",
        title="Cambridge IGCSE English as a Second Language (0510) — For examination in 2024–2026",
        pdf="/Users/ebrahimbintariq/Downloads/637160-2024-2026-syllabus (3).pdf",
        kind="esl",
        ranges=(10, 14),
    ),
]

MATH_SECTION_TITLES = {
    1: "1 Number",
    2: "2 Algebra and graphs",
    3: "3 Coordinate geometry",
    4: "4 Geometry",
    5: "5 Mensuration",
    6: "6 Trigonometry",
    7: "7 Transformations and vectors",
    8: "8 Probability",
    9: "9 Statistics",
}

SCIENCE_SECTION_TITLES = {
    "0610": {
        1: "1 Characteristics and classification of living organisms",
        2: "2 Organisation of the organism",
        3: "3 Movement into and out of cells",
        4: "4 Biological molecules",
        5: "5 Enzymes",
        6: "6 Plant nutrition",
        7: "7 Human nutrition",
        8: "8 Transport in plants",
        9: "9 Transport in animals",
        10: "10 Diseases and immunity",
        11: "11 Gas exchange in humans",
        12: "12 Respiration",
        13: "13 Excretion in humans",
        14: "14 Coordination and response",
        15: "15 Drugs",
        16: "16 Reproduction",
        17: "17 Inheritance",
        18: "18 Variation and selection",
        19: "19 Organisms and their environment",
        20: "20 Human influences on ecosystems",
        21: "21 Biotechnology and genetic modification",
    },
    "0620": {
        1: "1 States of matter",
        2: "2 Atoms, elements and compounds",
        3: "3 Stoichiometry",
        4: "4 Electrochemistry",
        5: "5 Chemical energetics",
        6: "6 Chemical reactions",
        7: "7 Acids, bases and salts",
        8: "8 The Periodic Table",
        9: "9 Metals",
        10: "10 Chemistry of the environment",
        11: "11 Organic chemistry",
        12: "12 Experimental techniques and chemical analysis",
    },
    "0625": {
        1: "1 Motion, forces and energy",
        2: "2 Thermal physics",
        3: "3 Waves",
        4: "4 Electricity and magnetism",
        5: "5 Nuclear physics",
        6: "6 Space physics",
    },
}


HEADER_PATTERNS = (
    re.compile(r"^===== PAGE \d+ =====$"),
    re.compile(r"^Cambridge IGCSE"),
    re.compile(r"^Cambridge IGCSE™"),
    re.compile(r"^Cambridge IGCSE First Language English"),
    re.compile(r"^Cambridge IGCSE English as a Second Language"),
    re.compile(r"^Back to contents page$"),
    re.compile(r"^www\.cambridgeinternational\.org/igcse$"),
    re.compile(r"^\d+$"),
    re.compile(r"^3 Subject content$"),
    re.compile(r"^Subject content$"),
    re.compile(r"^Core subject content$"),
    re.compile(r"^Extended subject content$"),
    re.compile(r"^Paper 1 Research Methods, Identity and Inequality$"),
    re.compile(r"^Paper 2 Family, Education and Crime$"),
    re.compile(r"^Computer systems$"),
    re.compile(r"^Algorithms, programming and logic$"),
)


def extract_pdf_text(pdf_path: str, start: int, end: int) -> str:
    SWIFT_CACHE.mkdir(parents=True, exist_ok=True)
    cmd = [
        "swift",
        "-module-cache-path",
        str(SWIFT_CACHE),
        str(SWIFT_HELPER),
        pdf_path,
        str(start),
        str(end),
    ]
    result = subprocess.run(cmd, check=True, capture_output=True, text=True)
    return result.stdout


def split_pages(raw_text: str) -> list[str]:
    pages: list[str] = []
    current: list[str] = []
    for line in raw_text.splitlines():
        if line.startswith("===== PAGE "):
            if current:
                pages.append("\n".join(current))
                current = []
            continue
        current.append(line)
    if current:
        pages.append("\n".join(current))
    return pages


def clean_lines(raw_text: str) -> list[str]:
    text = raw_text.replace("\u00a0", " ").replace("\r", "")
    lines = [line.rstrip() for line in text.splitlines()]
    cleaned: list[str] = []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        if any(pattern.match(stripped) for pattern in HEADER_PATTERNS):
            continue
        cleaned.append(stripped)
    return merge_marker_runs(cleaned)


def merge_marker_runs(lines: list[str]) -> list[str]:
    merged: list[str] = []
    index = 0
    while index < len(lines):
        line = lines[index]
        if line not in MARKER_ONLY_LINES:
            merged.append(line)
            index += 1
            continue

        marker = line
        run_end = index
        while run_end < len(lines) and lines[run_end] == marker:
            run_end += 1
        run_length = run_end - index

        values: list[str] = []
        value_end = run_end
        while value_end < len(lines) and len(values) < run_length:
            candidate = lines[value_end]
            if (
                candidate in MARKER_ONLY_LINES
                or candidate in GENERIC_SKIP_LINES
                or is_section_heading(candidate)
                or is_depth2_heading(candidate)
                or is_depth3_heading(candidate)
            ):
                break
            values.append(candidate)
            value_end += 1

        if len(values) == run_length:
            merged.extend(f"{marker} {value}" for value in values)
            index = value_end
            continue

        merged.append(line)
        index += 1
    return merged


def is_section_heading(line: str) -> bool:
    match = re.match(r"^(\d+)\s+(.+)$", line)
    if not match:
        return False
    title = match.group(2).strip()
    if not title or title.startswith("("):
        return False
    if len(title.split()) > 8:
        return False
    lower_title = title.lower()
    first_word_match = re.match(r"^[a-z]+", lower_title)
    if first_word_match and first_word_match.group(0) in SECTION_VERB_WORDS:
        return False
    if any(lower_title.startswith(prefix) for prefix in SECTION_VERB_PREFIXES):
        return False
    return title[0].isupper()


def is_depth2_heading(line: str) -> bool:
    return bool(re.match(r"^[A-Z]?\d+\.\d+\.?(?:\s|$)", line))


def parse_math_title(line: str) -> str:
    return re.sub(r"\s+Notes and examples$", "", line).strip()


def append_item(items: list[str], text: str):
    text = normalise_text(text)
    if text:
        items.append(text)


def append_or_extend(items: list[str], text: str):
    text = normalise_text(text)
    if not text:
        return
    if not items:
        items.append(text)
        return
    items[-1] = f"{items[-1]} {text}".strip()


def parse_math_level(raw_text: str, heading_prefix: str) -> list[dict]:
    topics: list[dict] = []
    current_topic = None

    for line in clean_lines(raw_text):
        if current_topic is not None:
            if re.match(r"^\d+\s+", line) or line.startswith("•"):
                append_item(current_topic["subtopics"], line)
                continue
            if not re.match(rf"^{heading_prefix}\d+\.\d+\s+", line):
                append_or_extend(current_topic["subtopics"], line)
                continue
        if re.match(rf"^{heading_prefix}\d+\.\d+\s+", line):
            title = parse_math_title(line)
            if "Extended content only." in title:
                current_topic = None
                continue
            current_topic = {"title": title, "subtopics": []}
            topics.append(current_topic)

    grouped: dict[int, list[dict]] = {}
    for topic in topics:
        match = re.match(rf"^{heading_prefix}(\d+)\.\d+\s+", topic["title"])
        if not match:
            continue
        section_no = int(match.group(1))
        if section_no not in MATH_SECTION_TITLES:
            continue
        grouped.setdefault(section_no, []).append(topic)

    sections = []
    for section_no in sorted(grouped):
        sections.append({"title": MATH_SECTION_TITLES.get(section_no, str(section_no)), "topics": grouped[section_no]})
    return heading_only_sections(sections)


def parse_science(raw_text: str, code: str) -> tuple[list[dict], list[dict]]:
    topics: list[dict] = []
    current_topic = None
    current_mode = "core"
    current_subheading = None
    section_titles = SCIENCE_SECTION_TITLES[code]
    science_section_titles = {normalise_continued_title(title) for title in section_titles.values()}

    def is_science_topic_heading(line: str) -> bool:
        return bool(re.match(r"^\d+\.\d+\s+[A-Za-z(]", line))

    def is_science_subheading(line: str) -> bool:
        return bool(re.match(r"^\d+\.\d+\.\d+\s+[A-Z(]", line))

    def is_science_learning_point(line: str) -> bool:
        match = re.match(r"^\d+\s+([A-Za-z][A-Za-z-]*)", line)
        return bool(match and match.group(1).lower() in SCIENCE_POINT_VERBS)

    def ensure_subheading(target: list[str]):
        if not current_subheading:
            return
        heading = normalise_continued_title(current_subheading)
        if target and normalise_continued_title(target[-1]) == heading:
            return
        target.append(current_subheading)

    for line in clean_lines(raw_text):
        line = normalise_continued_title(line)
        mode_line = re.sub(r"^[•–—-]\s+", "", line)
        if mode_line in {"Core", "Supplement", "Core Supplement"}:
            line = mode_line
        if line in science_section_titles:
            current_topic = None
            current_mode = "core"
            current_subheading = None
            continue
        if is_science_topic_heading(line):
            current_topic = {"title": line, "core": [], "supplement": []}
            topics.append(current_topic)
            current_mode = "core"
            current_subheading = None
            continue
        if is_science_subheading(line):
            current_subheading = clean_heading_title(line)
            continue
        if line == "Core":
            current_mode = "core"
            continue
        if line == "Supplement":
            current_mode = "supplement"
            continue
        if line == "Core Supplement":
            current_mode = "core"
            continue
        if current_topic is None:
            continue

        target = current_topic["core"] if current_mode == "core" else current_topic["supplement"]
        if is_science_learning_point(line):
            ensure_subheading(target)
            append_item(target, line)
            continue
        if line not in {"Core", "Supplement", "Core Supplement"}:
            append_or_extend(target, line)
    section_titles = SCIENCE_SECTION_TITLES[code]
    grouped_core: dict[int, list[dict]] = {}
    grouped_extended: dict[int, list[dict]] = {}

    def clean_science_points(values: list[str]) -> list[str]:
        cleaned: list[str] = []
        seen: set[str] = set()
        for value in values:
            point = normalise_text(value)
            point = re.sub(r"^[•–—-]\s*", "", point).strip()
            if not point:
                continue
            key = point.casefold()
            if key in seen:
                continue
            seen.add(key)
            cleaned.append(point)
        return cleaned

    for topic in topics:
        match = re.match(r"^(\d+)\.\d+\s+", topic["title"])
        if not match:
            continue
        section_no = int(match.group(1))
        if section_no not in section_titles:
            continue
        cleaned_title = clean_heading_title(topic["title"])
        has_core = bool(topic["core"])
        has_extended = has_core or bool(topic["supplement"])
        core_points = clean_science_points(topic["core"])
        extended_points = clean_science_points(topic["core"] + topic["supplement"])
        if has_core:
            section_topics = grouped_core.setdefault(section_no, [])
            existing = next((item for item in section_topics if item["title"] == cleaned_title), None)
            if existing is None:
                section_topics.append({
                    "title": cleaned_title,
                    "subtopics": core_points,
                })
            else:
                existing["subtopics"] = clean_science_points(existing["subtopics"] + core_points)
        if has_extended:
            section_topics = grouped_extended.setdefault(section_no, [])
            existing = next((item for item in section_topics if item["title"] == cleaned_title), None)
            if existing is None:
                section_topics.append({
                    "title": cleaned_title,
                    "subtopics": extended_points,
                })
            else:
                existing["subtopics"] = clean_science_points(existing["subtopics"] + extended_points)

    core_sections = []
    extended_sections = []
    for section_no in sorted(grouped_core):
        core_sections.append({"title": section_titles.get(section_no, str(section_no)), "topics": grouped_core[section_no]})
    for section_no in sorted(grouped_extended):
        extended_sections.append({"title": section_titles.get(section_no, str(section_no)), "topics": grouped_extended[section_no]})
    return add_ids(core_sections), add_ids(extended_sections)


def normalise_text(text: str) -> str:
    text = text.replace("\u0007", " ").replace("\u00ad", "")
    text = re.sub(r"[\u0000-\u001f]+", " ", text)
    text = re.sub(r"^([A-Z]?\d+(?:\.\d+)+)\.(?=[A-Za-z(])", r"\1. ", text)
    text = re.sub(r"(\([a-z]\))\.(?=[A-Za-z])", r"\1 ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def normalise_continued_title(text: str) -> str:
    return re.sub(r"\s+(?:\(?continued\)?)$", "", normalise_text(text), flags=re.I)


def clean_heading_title(text: str) -> str:
    text = normalise_continued_title(text).rstrip(":")
    text = re.sub(r"^[•–—-]\s*", "", text)
    text = re.sub(r"^([A-Z])(?=\d+(?:\.\d+)+\b)", "", text)
    text = re.sub(r"^([A-Z])(?=\d+\.\d+\s)", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def heading_only_sections(sections: list[dict]) -> list[dict]:
    output = []
    for section in sections:
        title = normalise_continued_title(section.get("title", "")).strip()
        seen_titles: set[str] = set()
        topics = []
        for topic in section.get("topics", []):
            heading = clean_heading_title(topic.get("title", ""))
            if not heading:
                continue
            key = heading.casefold()
            if key in seen_titles:
                continue
            seen_titles.add(key)
            topics.append({"title": heading, "subtopics": []})
        if title and topics:
            output.append({"title": title, "topics": topics})
    return add_ids(output)


def normalise_single_topic_section_codes(sections: list[dict], *, section_numbers: Optional[set[int]] = None) -> list[dict]:
    for section in sections:
        topics = section.get("topics", [])
        if len(topics) != 1:
            continue
        section_title = normalise_text(section.get("title", ""))
        topic_title = normalise_text(topics[0].get("title", ""))
        section_match = re.match(r"^(\d+)\s+(.+)$", section_title)
        topic_match = re.match(r"^(\d+)\s+(.+)$", topic_title)
        if not section_match or not topic_match:
            continue
        section_no = int(section_match.group(1))
        if section_numbers is not None and section_no not in section_numbers:
            continue
        if section_match.group(1) != topic_match.group(1):
            continue
        if section_match.group(2).strip() != topic_match.group(2).strip():
            continue
        topics[0]["title"] = f"{section_match.group(1)}.1 {topic_match.group(2).strip()}"
    return sections


def depth2_code(line: str) -> Optional[str]:
    match = re.match(r"^([A-Z]?\d+\.\d+)", normalise_text(line))
    return match.group(1) if match else None


def strip_depth2_heading(line: str) -> str:
    line = normalise_text(line).rstrip(":")
    line = re.sub(r"^([A-Z]?\d+\.\d+)\.?", r"\1", line)
    line = re.sub(r"^([A-Z]?\d+\.\d+)(?:\s+\d+\.\d+\.\d+\.?)+\s+", r"\1 ", line)
    return line.strip()


def is_depth3_heading(line: str) -> bool:
    return bool(re.match(r"^\d+\.\d+\.\d+\.?(?:\s|$)", normalise_text(line)))


def parse_generic_depth2(raw_text: str) -> list[dict]:
    sections: list[dict] = []
    current_section = None
    pending_section_title = None
    current_topic = None
    in_content = False
    pending_marker = None

    for line in clean_lines(raw_text):
        line = re.sub(r"\s+\(continued\)$", "", normalise_text(line))
        if not in_content:
            if is_section_heading(line):
                in_content = True
            else:
                continue

        if line.startswith("Paper ") and not re.match(r"^Paper \d+[A-Z]?\.\d", line):
            current_section = None
            pending_section_title = None
            current_topic = None
            pending_marker = None
            continue

        if is_section_heading(line):
            pending_section_title = normalise_continued_title(line)
            if sections and normalise_continued_title(sections[-1]["title"]) == pending_section_title:
                current_section = sections[-1]
            else:
                current_section = {"title": pending_section_title, "topics": []}
                sections.append(current_section)
            current_topic = None
            pending_marker = None
            continue

        current_code = depth2_code(current_topic["title"]) if current_topic is not None else None
        line_code = depth2_code(line)
        if current_topic is not None and line_code and current_code == line_code:
            remainder = normalise_text(line[len(line_code):]).lstrip()
            if remainder and remainder[0].isdigit():
                append_item(current_topic["subtopics"], line.rstrip(":"))
                pending_marker = None
                continue

        if is_depth2_heading(line):
            if current_section is None:
                current_section = {"title": pending_section_title or "Uncategorised", "topics": []}
                sections.append(current_section)
            topic_title = normalise_continued_title(strip_depth2_heading(line))
            last_topic = current_section["topics"][-1] if current_section["topics"] else None
            if last_topic and normalise_continued_title(last_topic["title"]) == topic_title:
                current_topic = last_topic
            else:
                current_topic = {"title": topic_title, "subtopics": []}
                current_section["topics"].append(current_topic)
            pending_marker = None
            continue

        if current_topic is None:
            if current_section is not None and re.match(r"^\d+\s+", line):
                last_topic = current_section["topics"][-1] if current_section["topics"] else None
                if last_topic and normalise_continued_title(last_topic["title"]) == normalise_continued_title(current_section["title"]):
                    current_topic = last_topic
                else:
                    current_topic = {"title": current_section["title"], "subtopics": []}
                    current_section["topics"].append(current_topic)
            else:
                continue

        if line in GENERIC_SKIP_LINES:
            continue
        if line in MARKER_ONLY_LINES:
            pending_marker = line
            continue
        if is_depth3_heading(line):
            append_item(current_topic["subtopics"], line.rstrip(":"))
            pending_marker = None
            continue
        if line.startswith("•") or line.startswith("–") or re.match(r"^\(\w\)\s+", line):
            append_item(current_topic["subtopics"], line)
            pending_marker = None
            continue
        if re.match(r"^\d+\s+", line):
            append_item(current_topic["subtopics"], line)
            pending_marker = None
            continue
        if pending_marker is not None:
            append_item(current_topic["subtopics"], f"{pending_marker} {line}")
            pending_marker = None
            continue
        append_or_extend(current_topic["subtopics"], line)

    return heading_only_sections(sections)


def parse_fle(raw_text: str) -> list[dict]:
    pages = split_pages(raw_text)
    blocks = [
        ("Reading", pages[0] if len(pages) > 0 else ""),
        ("Writing", pages[0] if len(pages) > 0 else ""),
        ("Speaking and Listening", pages[1] if len(pages) > 1 else ""),
    ]
    sections = []
    for title, page_text in blocks:
        if title == "Reading":
            match = re.search(r"Reading\s+(.*?)Writing\s+•", page_text, re.S)
        elif title == "Writing":
            match = re.search(r"Writing\s+(.*?)Speaking and Listening", "\n".join(pages[:2]), re.S)
        else:
            match = re.search(r"Speaking and Listening\s+(.*)", page_text, re.S)
        body = match.group(1) if match else page_text
        lines = clean_lines(body)
        topics: list[dict] = []
        for line in lines:
            if line.startswith("•"):
                heading = clean_heading_title(line)
                if heading:
                    topics.append({"title": heading, "subtopics": []})
        sections.append({"title": title, "topics": topics})
    return add_ids(sections)


def parse_economics(raw_text: str) -> list[dict]:
    sections: list[dict] = []
    current_section = None
    current_topic = None
    pending_topic_code = None
    in_content = False

    for line in clean_lines(raw_text):
        line = re.sub(r"\s+\(continued\)$", "", normalise_text(line))
        if not in_content:
            if is_section_heading(line):
                in_content = True
            else:
                continue

        if is_section_heading(line):
            current_section = {"title": line, "topics": []}
            sections.append(current_section)
            current_topic = None
            pending_topic_code = None
            continue

        topic_match = re.match(r"^(\d+\.\d+)\s+(.+)$", line)
        if topic_match and not re.match(r"^\d+\.\d+\.\d+", line):
            code = topic_match.group(1)
            title_part = topic_match.group(2).strip()
            if title_part == "Topic":
                current_topic = {"title": code, "subtopics": []}
                if current_section is not None:
                    current_section["topics"].append(current_topic)
                pending_topic_code = code
                continue
            current_topic = {"title": f"{code} {title_part}", "subtopics": []}
            if current_section is not None:
                current_section["topics"].append(current_topic)
            pending_topic_code = None
            continue

        if line in {"Topic", "Guidance"}:
            continue

        if current_topic is not None and current_topic["title"] == pending_topic_code and not is_depth3_heading(line):
            current_topic["title"] = f"{pending_topic_code} {line}"
            pending_topic_code = None
            continue

        if current_topic is None:
            continue

        if is_depth3_heading(line):
            append_item(current_topic["subtopics"], line.rstrip(":"))
            continue
        if line.startswith("•") or line.startswith("–") or re.match(r"^\(\w\)\s+", line):
            append_item(current_topic["subtopics"], line)
            continue
        append_or_extend(current_topic["subtopics"], line)

    return heading_only_sections(sections)


def parse_esl(raw_text: str) -> list[dict]:
    pages = split_pages(raw_text)
    names = ["Reading", "Writing", "Listening", "Speaking"]
    sections = []
    for name, page_text in zip(names, pages[1:5]):
        lines = clean_lines(page_text)
        topic_groups = []
        current_topic_parts = None
        for line in lines:
            if line == name:
                continue
            if line == "Content Examples":
                continue
            if line.startswith("•"):
                text = clean_heading_title(line)
                first_word = re.match(r"^[a-z]+", text.lower())
                if first_word and first_word.group(0) in ESL_HEADING_VERBS:
                    if current_topic_parts:
                        topic_groups.append({"title": clean_heading_title(" ".join(current_topic_parts)), "subtopics": []})
                    current_topic_parts = [text]
                elif current_topic_parts:
                    topic_groups.append({"title": clean_heading_title(" ".join(current_topic_parts)), "subtopics": []})
                    current_topic_parts = None
                continue
            if current_topic_parts is None:
                continue
            if line.startswith("Back to contents page") or is_section_heading(line):
                continue
            current_topic_parts.append(line)
        if current_topic_parts:
            topic_groups.append({"title": clean_heading_title(" ".join(current_topic_parts)), "subtopics": []})
        sections.append({"title": name, "topics": topic_groups or [{"title": name, "subtopics": []}]})
    return add_ids(sections)


def add_ids(sections: list[dict]) -> list[dict]:
    output = []
    for s_idx, section in enumerate(sections, start=1):
        topics = [
            topic
            for topic in section.get("topics", [])
            if topic.get("title") or topic.get("subtopics")
        ]
        if not topics:
            continue
        sec = {
            "id": f"section-{s_idx}",
            "title": section["title"],
            "topics": [],
        }
        for t_idx, topic in enumerate(topics, start=1):
            sec["topics"].append(
                {
                    "id": f"topic-{s_idx}-{t_idx}",
                    "title": topic["title"],
                    "subtopics": [item for item in topic.get("subtopics", []) if item],
                }
            )
        output.append(sec)
    return output


def build_subject_data(config: SubjectConfig) -> dict:
    if config.kind == "math":
        core_raw = extract_pdf_text(config.pdf, *config.ranges["core"])
        extended_raw = extract_pdf_text(config.pdf, *config.ranges["extended"])
        return {
            "title": config.title,
            "core": parse_math_level(core_raw, "C"),
            "extended": parse_math_level(extended_raw, "E"),
        }

    if config.kind == "science":
        raw = extract_pdf_text(config.pdf, *config.ranges)
        core, extended = parse_science(raw, config.code)
        return {
            "title": config.title,
            "core": core,
            "extended": extended,
        }

    if config.kind == "generic_depth2":
        raw = extract_pdf_text(config.pdf, *config.ranges)
        units = parse_generic_depth2(raw)
        if config.code == "0478":
            units = normalise_single_topic_section_codes(units, section_numbers={7})
        return {
            "title": config.title,
            "units": units,
        }

    if config.kind == "economics":
        raw = extract_pdf_text(config.pdf, *config.ranges)
        return {
            "title": config.title,
            "units": parse_economics(raw),
        }

    if config.kind == "fle":
        raw = extract_pdf_text(config.pdf, *config.ranges)
        return {
            "title": config.title,
            "units": parse_fle(raw),
        }

    if config.kind == "esl":
        raw = extract_pdf_text(config.pdf, *config.ranges)
        return {
            "title": config.title,
            "units": parse_esl(raw),
        }

    raise ValueError(f"Unsupported parser kind: {config.kind}")


def main():
    for config in CONFIGS:
        data = build_subject_data(config)
        path = REPO_ROOT / "resources" / config.slug / "syllabus.json"
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
        print(f"updated {path}")


if __name__ == "__main__":
    main()
