import type { PictureFailure } from "./pictureFailure";

/** One failure as a sentence and the next step, with the detail in a collapsed block when there is one. */
export function PictureFailureNote({ failure }: { failure: PictureFailure }) {
  return (
    <>
      <p role="alert" className="picture-failure">
        {failure.sentence} <span className="picture-failure-next">{failure.next}</span>
      </p>
      {failure.detail !== null ? (
        <details className="picture-failure-details">
          <summary>Details</summary>
          <p>{failure.detail}</p>
        </details>
      ) : null}
    </>
  );
}
