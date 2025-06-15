import React from "react";
import {
  reactExtension,
  useApi,
  AdminAction,
  BlockStack,
  Button,
  Text,
} from "@shopify/ui-extensions-react/admin";

const TARGET = "admin.order-details.action.render";

export default reactExtension(TARGET, () => <App />);

function App() {
  const { data, query, close } = useApi(TARGET);
  const [loading, setLoading] = React.useState(false);
  
  const handleExport = async () => {
    setLoading(true);
    
    try {
      const orderId = data.selected?.[0]?.id;
      if (!orderId) {
        console.error('No order selected');
        return;
      }

      // GraphQL 쿼리 실행
      const orderData = await query(
        `query getOrder($id: ID!) {
          order(id: $id) {
            name
            customer {
              firstName
              lastName
            }
            lineItems(first: 100) {
              edges {
                node {
                  title
                  quantity
                  variant {
                    sku
                    barcode
                    selectedOptions {
                      name
                      value
                    }
                  }
                }
              }
            }
          }
        }`,
        {
          variables: { id: orderId },
        }
      );

      const order = orderData.data.order;
      if (!order) {
        throw new Error('Order not found');
      }

      // CSV 생성
      const csvRows = [];
      
      // 헤더
      csvRows.push([
        "Order Reference",
        "Customer Name",
        "Account Code",
        "Style",
        "Fabric",
        "Colour",
        "Size",
        "Barcode",
        "Sales Order Quantity"
      ]);

      // 데이터 행
      order.lineItems.edges.forEach(({ node: item }) => {
        const customerName = order.customer 
          ? `${order.customer.firstName || ''} ${order.customer.lastName || ''}`.trim()
          : 'Guest';
        
        let size = '';
        let colour = '';
        
        if (item.variant?.selectedOptions) {
          item.variant.selectedOptions.forEach(option => {
            const optionName = option.name.toLowerCase();
            if (optionName === 'size') {
              size = option.value;
            } else if (optionName === 'color' || optionName === 'colour') {
              colour = option.value;
            }
          });
        }

        const style = item.variant?.sku || item.title || '';

        csvRows.push([
          order.name,
          customerName,
          '',
          style,
          '',
          colour,
          size,
          item.variant?.barcode || '',
          item.quantity.toString()
        ]);
      });

      // CSV 문자열로 변환
      const csvContent = csvRows
        .map(row => row.map(cell => {
          const cellStr = String(cell || '');
          if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
            return `"${cellStr.replace(/"/g, '""')}"`;
          }
          return cellStr;
        }).join(','))
        .join('\n');

      // BOM 추가
      const bom = '\ufeff';
      const finalCsv = bom + csvContent;

      // Blob 생성 및 다운로드
      const blob = new Blob([finalCsv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `zedonk_order_${order.name.replace('#', '')}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      // 성공 후 닫기
      setTimeout(() => close(), 1000);
      
    } catch (error) {
      console.error('Export failed:', error);
      alert(`Export failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AdminAction
      primaryAction={
        <Button 
          onPress={handleExport} 
          variant="primary"
          disabled={loading}
        >
          {loading ? 'Processing...' : 'Download CSV'}
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
          Export to Zedonk CSV
        </Text>
        <Text variant="bodyMd" as="p">
          주문 데이터를 Zedonk 형식으로 다운로드합니다.
        </Text>
        {loading && (
          <Text variant="bodySm" as="p" tone="subdued">
            데이터를 처리하는 중...
          </Text>
        )}
      </BlockStack>
    </AdminAction>
  );
}