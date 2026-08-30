import { getRequestConfig } from "next-intl/server";

import { DEFAULT_LOCALE } from "@/i18n/config";
import messages from "@/messages/uk.json";

export default getRequestConfig(async () => ({
  locale: DEFAULT_LOCALE,
  messages,
}));
