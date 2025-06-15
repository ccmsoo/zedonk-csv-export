import { json } from "@remix-run/node";

export const loader = async ({ params }) => {
  try {
    const orderId = params.id;

    if (!orderId) {
      return json({ error: "Order ID is required" }, { status: 400 });
    }

    // 임시로 샘플 데이터 반환 (인증 문제 해결 전)
    const sampleData = {
      order: {
        name: `#${orderId}`,
        customer: {
          firstName: "John",
          lastName: "Doe",
          email: "john.doe@example.com"
        },
        lineItems: {
          edges: [
            {
              node: {
                title: "Sample Product",
                quantity: 2,
                variant: {
                  sku: "SAMPLE-SKU-001",
                  barcode: "1234567890",
                  selectedOptions: [
                    { name: "Size", value: "L" },
                    { name: "Color", value: "Black" }
                  ]
                }
              }
            }
          ]
        }
      }
    };

    // Zedonk CSV 형식으로 데이터 변환
    const csvRows = [];
    
    // 헤더 추가
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

    // 샘플 데이터로 행 생성
    const order = sampleData.order;
    order.lineItems.edges.forEach(({ node: item }) => {
      const customerName = `${order.customer.firstName} ${order.customer.lastName}`;
      
      // 옵션에서 Size와 Colour 추출
      let size = '';
      let colour = '';
      
      item.variant.selectedOptions.forEach(option => {
        if (option.name.toLowerCase() === 'size') {
          size = option.value;
        } else if (option.name.toLowerCase() === 'color' || option.name.toLowerCase() === 'colour') {
          colour = option.value;
        }
      });

      csvRows.push([
        order.name,
        customerName,
        '',  // Account Code
        item.title,
        '',  // Fabric
        colour,
        size,
        item.variant.barcode || '',
        item.quantity.toString()
      ]);
    });

    // CSV 문자열로 변환
    const csvContent = csvRows
      .map(row => row.map(cell => {
        const cellStr = String(cell);
        if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
          return `"${cellStr.replace(/"/g, '""')}"`;
        }
        return cellStr;
      }).join(','))
      .join('\n');

    // CSV 파일로 응답
    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="zedonk_order_${orderId}.csv"`,
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error) {
    console.error("API Error:", error);
    return json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
};