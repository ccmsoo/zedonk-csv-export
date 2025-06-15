import { useCallback, useState } from "react";
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleExport = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      // 선택된 주문의 ID 가져오기
      const orderId = data.selected[0]?.id;
      
      if (!orderId) {
        throw new Error('No order selected');
      }

      // GID에서 숫자 ID만 추출 (gid://shopify/Order/123456 -> 123456)
      const numericId = orderId.split('/').pop();
      
      // Vercel API 엔드포인트 호출
      const apiUrl = `https://zedonk-csv-export.vercel.app/api/order/${numericId}`;
      
      // fetch 대신 window.open 사용하여 직접 다운로드
      const downloadWindow = window.open(apiUrl, '_blank');
      
      // 다운로드 시작 메시지
      console.log(`Downloading CSV for order ${numericId} from ${apiUrl}`);
      
      // 잠시 후 모달 닫기
      setTimeout(() => {
        close();
      }, 2000);

    } catch (err) {
      console.error('Export failed:', err);
      setError(err.message || 'Failed to export CSV');
    } finally {
      setLoading(false);
    }
  }, [data, close]);

  return (
    <AdminAction
      primaryAction={
        <Button
          onPress={handleExport}
          loading={loading}
          disabled={loading}
          variant="primary"
        >
          {loading ? 'Exporting...' : 'Export CSV'}
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
        
        {error && (
          <Text variant="bodySm" as="p" tone="critical">
            Error: {error}
          </Text>
        )}
      </BlockStack>
    </AdminAction>
  );
}