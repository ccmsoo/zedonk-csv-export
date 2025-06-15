import { useCallback, useState } from "react";
import {
  reactExtension,
  useApi,
  AdminAction,
  BlockStack,
  Button,
  Text,
  InlineStack,
} from "@shopify/ui-extensions-react/admin";

// Extension의 target을 정의
const TARGET = "admin.order-details.action.render";

// Extension export
export default reactExtension(TARGET, () => <App />);

function App() {
  const { data, close } = useApi(TARGET);
  const [showLink, setShowLink] = useState(false);

  const handleExport = useCallback(() => {
    // 선택된 주문의 ID 가져오기
    const orderId = data.selected[0]?.id;
    
    if (!orderId) {
      console.error('No order selected');
      return;
    }

    // GID에서 숫자 ID만 추출
    const numericId = orderId.split('/').pop();
    
    // 다운로드 링크 표시
    setShowLink(true);
  }, [data]);

  const getDownloadUrl = () => {
    const orderId = data.selected[0]?.id;
    const numericId = orderId ? orderId.split('/').pop() : '';
    return `https://zedonk-csv-export.onrender.com/api/order/${numericId}`;
  };

  return (
    <AdminAction
      primaryAction={
        <Button
          onPress={handleExport}
          variant="primary"
        >
          Generate Download Link
        </Button>
      }
      secondaryAction={
        <Button onPress={() => close()} variant="plain">
          Cancel
        </Button>
      }
    >
      <BlockStack gap>
        <Text variant="headingMd" as="h2">
          Export to Zedonk CSV Format
        </Text>
        
        <Text variant="bodyMd" as="p">
          This will download the order data in Zedonk's CSV format with the following columns:
        </Text>
        
        <BlockStack gap="extraTight">
          <Text variant="bodySm" as="p" tone="subdued">
            • Order Reference
          </Text>
          <Text variant="bodySm" as="p" tone="subdued">
            • Customer Name
          </Text>
          <Text variant="bodySm" as="p" tone="subdued">
            • Style, Colour, Size
          </Text>
          <Text variant="bodySm" as="p" tone="subdued">
            • Barcode & Quantity
          </Text>
        </BlockStack>
        
        {showLink && (
          <BlockStack gap="tight">
            <Text variant="bodySm" as="p" tone="success">
              ✅ Download link is ready!
            </Text>
            <Text variant="bodySm" as="p">
              Copy this link and paste it in a new browser tab:
            </Text>
            <InlineStack gap="tight">
              <Text variant="bodySm" as="p" tone="subdued">
                {getDownloadUrl()}
              </Text>
            </InlineStack>
            <Text variant="bodySm" as="p" tone="subdued">
              Note: Open the link in a new tab to download the CSV file.
            </Text>
          </BlockStack>
        )}
      </BlockStack>
    </AdminAction>
  );
}