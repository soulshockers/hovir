import { memorySlideStateStore } from "@/lib/plugins/store";
import { describeSlideStateStoreContract } from "@/lib/plugins/testing/store-contract";

describeSlideStateStoreContract("пам'ять", () => memorySlideStateStore());
