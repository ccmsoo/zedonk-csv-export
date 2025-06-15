import { json } from "@remix-run/node";

// Private App Access Token (환경변수로 관리 권장)
const PRIVATE_ACCESS_TOKEN = "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";
const SHOP_DOMAIN = "cpnmmm-wb.myshopify.com";

export const loader = async ({ request, params }) => {
  try {
    const orderId = params.id;
    console.log("API called with order ID:", orderId);

    if (!orderId) {
      return json({ error: "Order ID is required" }, { status: 400 });
    }

    // Private App으로 GraphQL 요청
    const graphqlEndpoint = `https://${SHOP_DOMAIN}/admin/api/2024-01/graphql.json`;
    
    const graphqlQuery = {
      query: `
        query getOrder($id: ID!) {
          order(id: $id) {
            name
            email
            customer {
              firstName
              lastName
              email
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
        }
      `,
      variables: {
        id: `gid://shopify/Order/${orderId}`
      }
    };

    const response = await fetch(graphqlEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': PRIVATE_ACCESS_TOKEN,
      },
      body: JSON.stringify(graphqlQuery),
    });

    const responseData = await response.json();
    console.log("GraphQL response received");
    
    if (responseData.errors) {
      console.error("GraphQL errors:", responseData.errors);
      return json({ error: "GraphQL query failed", details: responseData.errors }, { status: 400 });
    }
    
    const order = responseData?.data?.order;
    
    if (!order) {
      return json({ error: "Order not found" }, { status: 404 });
    }

    // CSV 생성 (기존 코드와 동일)
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

    // 주문 데이터로 행 생성
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

    // CSV 파일로 응답
    return new Response(finalCsv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="zedonk_order_${orderId}.csv"`,
        'Cache-Control': 'no-cache',
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