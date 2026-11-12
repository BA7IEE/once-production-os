// Run the synthetic SDK and worker boundary regressions in the regular core CI.
// The SDK loopback service is local; none of these tests uses a real COS bucket.
import '../verification/cos-boundaries-20261109.test.ts';
import '../verification/cos-eventual-list-open-20261109.test.ts';
import '../verification/cos-purge-worker-20261109.test.ts';
import '../verification/cos-sdk-acl-20261109.test.ts';
import '../verification/cos-sdk-loopback-20261109.test.ts';
