// face-crop: a person marks the part of their picture that becomes their face (or uses the whole
// picture), the wire form of that mark, and the way back from the shown face to the master.
export {
  FACE_WHOLE,
  clampFaceRect,
  faceQueryValue,
  rectFromDisplayedBox,
  initialSquare,
} from "./faceRect";
export type { FaceRect } from "./faceRect";
export {
  CROPPED_FROM_ATTR,
  appendFaceQuery,
  faceEntityFor,
  faceLocationFor,
  faceFileId,
  leanFaceNotice,
  masterBehindFace,
  fileIdFromEntityUri,
  canRecut,
} from "./leanFace";
export type { LeanFaceAck, UploadAck, MasterLookup } from "./leanFace";
export { FaceCropper } from "./FaceCropper";
export type { FaceCropperProps } from "./FaceCropper";
