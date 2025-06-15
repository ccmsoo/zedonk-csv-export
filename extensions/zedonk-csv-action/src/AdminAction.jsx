import React from "react";
import {
  reactExtension,
  useApi,
  AdminAction,
  BlockStack,
  Button,
  Text,
  Link,
} from "@shopify/ui-extensions-react/admin";

const TARGET = "admin.order-details.action.render";

export default reactExtension(TARGET, () => <App />);

function App() {
  const { data, close } = useApi(TARGET);
  
  const orderId = data.selected?.[0]?.id;
  const numericId = orderId ? orderId.split('/').pop() : '';
  
  return (
    <AdminAction
      primaryAction={
        <Button onPress={() => close()} variant="primary">
          닫기
        </Button>
      }
    >
      <BlockStack gap>
        <Text variant="headingMd" as="h2">
          Zedonk CSV Export
        </Text>
        
        <Text variant="bodyMd" as="p">
          주문 번호: {numericId}
        </Text>
        
        <Text variant="bodyMd" as="p">
          브라우저 새 탭에서 아래 주소를 입력하세요:
        </Text>
        
        <Text variant="bodyMd" as="p" tone="critical">
          https://zedonk-csv-export.onrender.com/api/order/{numericId}
        </Text>
        
        <Text variant="bodySm" as="p" tone="subdued">
          위 주소를 복사해서 새 탭에 붙여넣으면 CSV가 다운로드됩니다.
        </Text>
      </BlockStack>
    </AdminAction>
  );
}