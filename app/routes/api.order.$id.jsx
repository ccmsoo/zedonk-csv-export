import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request, params }) => {
  const { admin } = await authenticate.admin(request);
  const orderId = params.id;

  try {
    // REST API로 주문 정보 가져오기
    const response = await admin.rest.resources.Order.find({
      session: admin.session,
      id: orderId,
    });

    // CSV용 데이터 포맷팅
    const order = response;
    const csvData = {
      orderNumber: order.name,
      date: new Date(order.created_at).toLocaleDateString(),
      email: order.email || order.customer?.email || '',
      customerName: order.customer ? 
        `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim() : '',
      lineItems: order.line_items.map(item => ({
        title: item.title,
        sku: item.sku || '',
        quantity: item.quantity,
        price: item.price,
      })),
      total: order.total_price,
      address: order.shipping_address ? 
        `${order.shipping_address.address1 || ''} ${order.shipping_address.city || ''} ${order.shipping_address.province || ''} ${order.shipping_address.country || ''}`.trim() : ''
    };

    return json({ success: true, data: csvData });
  } catch (error) {
    console.error('Failed to fetch order:', error);
    return json({ success: false, error: error.message }, { status: 500 });
  }
};