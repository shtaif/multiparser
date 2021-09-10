import pipe from '../../../utils/pipe';
import looseAsyncIterWrapper from '../../looseAsyncIterWrapper';
import combineBuffersWithMatchesForSequence, {
  BufferWithSequenceMatches,
} from '../combineBuffersWithMatchesForSequence';
import propagateErrorFromAsyncSubIter from './propagateErrorFromAsyncSubIter';

export default splitAsyncIterByOccuranceOnce;

function splitAsyncIterByOccuranceOnce(
  originalSource: AsyncIterable<Buffer>,
  searchSequence: Buffer
): AsyncGenerator<AsyncGenerator<Buffer, void>, void> {
  return pipe(
    originalSource,
    combineBuffersWithMatchesForSequence(searchSequence),
    async function* (sourceWithMatches) {
      let itemWithOccurrence: BufferWithSequenceMatches | undefined;

      yield (async function* () {
        for await (const item of looseAsyncIterWrapper(sourceWithMatches)) {
          if (item.matches.length) {
            itemWithOccurrence = item;
            const { buffer } = itemWithOccurrence;
            const { startIdx } = itemWithOccurrence.matches[0];
            const bufferBeforeOccurrence = buffer.subarray(0, startIdx);
            yield bufferBeforeOccurrence;
            break;
          }
          yield item.buffer;
        }
      })();

      if (!itemWithOccurrence) {
        return;
      }

      yield (async function* () {
        const { endIdx } = itemWithOccurrence.matches[0];

        const bufferAfterOccurrence =
          endIdx !== -1
            ? itemWithOccurrence.buffer.subarray(endIdx)
            : await (async () => {
                for await (const item of looseAsyncIterWrapper(
                  sourceWithMatches
                )) {
                  const { buffer } = item;
                  const { endIdx } = item.matches[0];
                  if (endIdx !== -1) {
                    return buffer.subarray(endIdx);
                  }
                }
              })();

        if (bufferAfterOccurrence) {
          yield bufferAfterOccurrence;
        }

        yield* originalSource;
      })();
    },
    splitSource => propagateErrorFromAsyncSubIter(splitSource)
  );
}
