#!/usr/bin/env python3
# services/vision/detect.py
# Usage:
#   python services/vision/detect.py --image "/abs/or/rel/path.jpg"
# Output JSON to stdout:
#   {"objects":["sofa","coffee table","rug"],"raw":["couch","dining table"],"conf":{"sofa":0.71}}

import argparse
import json
import os
import sys

# YOLOv8 COCO class mapping -> your furniture needs (search-friendly)
COCO_TO_NEED = {
    # COCO labels:
    "couch": "sofa",
    "chair": "dining chair",
    "bed": "bed",
    "dining table": "dining table",
    "tv": "tv console",
    "laptop": "desk",
    "potted plant": "decor plant",
    # not perfect, but useful for interior shopping
}

# Keep only relevant “interior-ish” classes for your app
RELEVANT_COCO = set(COCO_TO_NEED.keys())

def safe_float(x, default=0.0):
    try:
        return float(x)
    except Exception:
        return default

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--image", required=True, help="Path to image file")
    ap.add_argument("--conf", default="0.30", help="Confidence threshold (default 0.30)")
    args = ap.parse_args()

    image_path = args.image
    conf_thr = safe_float(args.conf, 0.30)

    if not os.path.exists(image_path):
        print(json.dumps({"objects": [], "raw": [], "error": f"Image not found: {image_path}"}))
        return 0

    try:
        from ultralytics import YOLO
    except Exception as e:
        print(json.dumps({"objects": [], "raw": [], "error": f"Missing ultralytics. Install: pip install ultralytics. Details: {str(e)}"}))
        return 0

    try:
        # YOLOv8n is small + fast; good enough for furniture presence detection
        model = YOLO("yolov8n.pt")
        results = model.predict(source=image_path, conf=conf_thr, verbose=False)

        raw_labels = []
        conf_by_need = {}

        for r in results:
            names = getattr(r, "names", {})
            boxes = getattr(r, "boxes", None)
            if boxes is None:
                continue

            cls_list = boxes.cls.tolist() if getattr(boxes, "cls", None) is not None else []
            conf_list = boxes.conf.tolist() if getattr(boxes, "conf", None) is not None else []

            for cls_id, c in zip(cls_list, conf_list):
                label = names.get(int(cls_id), None)
                if not label:
                    continue
                if label not in RELEVANT_COCO:
                    continue

                raw_labels.append(label)

                need = COCO_TO_NEED.get(label)
                if not need:
                    continue

                # keep max confidence per mapped need
                prev = conf_by_need.get(need, 0.0)
                if float(c) > prev:
                    conf_by_need[need] = float(c)

        # Unique needs sorted by confidence desc
        objects = sorted(conf_by_need.keys(), key=lambda k: conf_by_need[k], reverse=True)

        # Optional: limit number of detected objects to keep UI clean
        objects = objects[:8]

        out = {
            "objects": objects,
            "raw": list(dict.fromkeys(raw_labels)),  # unique preserve order
            "conf": conf_by_need,
        }
        print(json.dumps(out))
        return 0

    except Exception as e:
        print(json.dumps({"objects": [], "raw": [], "error": str(e)}))
        return 0


if __name__ == "__main__":
    sys.exit(main())
