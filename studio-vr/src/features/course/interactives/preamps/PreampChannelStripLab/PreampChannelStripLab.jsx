import { TopicTabsLab } from "../../shared/ExampleLab/ExampleLab";
import { PREAMP_STRIP_TABS, preampStripImagePath } from "./preampChannelStripData";

export default function PreampChannelStripLab(props) {
  return <TopicTabsLab {...props} tabs={PREAMP_STRIP_TABS} imagePath={preampStripImagePath} ariaLabel="Preamp and channel strip topics" />;
}
