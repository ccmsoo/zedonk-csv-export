import { useCallback } from "react";
import {
  reactExtension,
  useApi,
  AdminAction,
  BlockStack,
  Button,
  Text,
} from "@shopify/ui-extensions-react/admin";

// Extension의 target을 정의
const TARGET = "admin.order-details.action.render";

// Extension export
export default reactExtension(TARGET, () => <App />);

function App() {
  const { data, close } = useApi(TARGET);

  const handleExport = useCallback(() => {
    // 선택된 주문의 ID 가져오기
    const orderId = data.selected[0]?.id;
    
    if (!orderId) {
      console.error('No order selected');
      return;
    }

    // GID에서 숫자 ID만 추출
    const numericId = orderId.split('/').pop();
    
    // 다운로드 URL 생성
    const downloadUrl = `https://zedonk-csv-export.onrender.com/api/order/${numericId}`;
    
    // 새 창에서 열기
    window.open(downloadUrl, '_blank');
    
    // 2초 후 모달 닫기
    setTimeout(() => close(), 2000);
  }, [data, close]);

  return (
    <AdminAction
      primaryAction={
        <Button
          onPress={handleExport}
          variant="primary"
        >
          Download CSV
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
          Click "Download CSV" to export the order data.
        </Text>
        
        <Text variant="bodySm" as="p" tone="subdued">
          A new tab will open to download the file.
        </Text>
        
        <Text variant="bodySm" as="p" tone="subdued">
          If the download doesn't start, check your popup blocker.
        </Text>
      </BlockStack>
    </AdminAction>
  );
}