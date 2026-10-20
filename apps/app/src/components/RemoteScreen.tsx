import type { Call } from '@houston/core';
import { MediaView } from './MediaView';

interface Props {
  stream: MediaStream;
  call: Call;
  controlling: boolean;
  testID?: string;
}

/** On phones Houston only watches; controlling works from the web or desktop app. */
export function RemoteScreen({ stream, testID }: Props) {
  return <MediaView stream={stream} testID={testID} />;
}
