import sys, glob, json
import Vision, Quartz
from Foundation import NSURL

def ocr(path):
    url = NSURL.fileURLWithPath_(path)
    src = Quartz.CGImageSourceCreateWithURL(url, None)
    if not src: return ""
    img = Quartz.CGImageSourceCreateImageAtIndex(src, 0, None)
    if not img: return ""
    req = Vision.VNRecognizeTextRequest.alloc().init()
    req.setRecognitionLanguages_(["ja-JP", "en-US"])
    req.setRecognitionLevel_(0)   # accurate
    handler = Vision.VNImageRequestHandler.alloc().initWithCGImage_options_(img, None)
    ok, err = handler.performRequests_error_([req], None)
    out = []
    for obs in (req.results() or []):
        c = obs.topCandidates_(1)
        if c and len(c): out.append(str(c[0].string()))
    return "\n".join(out)

res = {}
for f in sorted(glob.glob(sys.argv[1])):
    res[f] = ocr(f)
print(json.dumps(res, ensure_ascii=False))
