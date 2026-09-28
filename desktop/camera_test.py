import cv2

cap = cv2.VideoCapture("/dev/video2", cv2.CAP_V4L2)

print("Opened:", cap.isOpened())

ret, frame = cap.read()
print("Read frame:", ret)

if ret:
    print("Frame shape:", frame.shape)

cap.release()